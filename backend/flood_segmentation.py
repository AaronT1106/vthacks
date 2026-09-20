"""SegFormer flood/water inference and temporary mask storage."""

from __future__ import annotations

import io
import logging
import os
import threading
import time
import uuid
import warnings
from dataclasses import dataclass
from typing import Any

import numpy as np
from PIL import Image, UnidentifiedImageError

DEFAULT_MODEL_ID = "gdurkin/segformer-b0-finetuned-segments-floods-S2"
DEFAULT_MODEL_REVISION = "f94b7a0254011883dc17f04d88355f8e7adc5263"
MASK_TTL_SECONDS = 3600
MAX_CACHED_MASKS = 8
SUPPORTED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp"}

logger = logging.getLogger(__name__)
_model_lock = threading.Lock()
_inference_lock = threading.Lock()
_mask_lock = threading.Lock()
_processor: Any | None = None
_model: Any | None = None
_model_device = "cpu"
_model_identifier = ""
_model_revision = ""
_water_class_id: int | None = None
_invalid_class_id: int | None = None
_mask_cache: dict[str, tuple[float, bytes]] = {}


class FloodAnalysisError(RuntimeError):
    """Safe error raised for expected model, image, or inference failures."""

    def __init__(self, detail: str, status_code: int = 500):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


@dataclass(frozen=True)
class DecodedImage:
    image: Image.Image
    width: int
    height: int
    format: str
    original_mode: str
    byte_size: int


def decode_image(image_bytes: bytes, content_type: str) -> DecodedImage:
    if content_type not in SUPPORTED_IMAGE_TYPES:
        raise FloodAnalysisError("Unsupported After image type.", 400)
    if not image_bytes:
        raise FloodAnalysisError("After image pixels are unavailable.", 400)

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(image_bytes)) as source:
                source_format = (source.format or "").upper()
                original_mode = source.mode
                source.load()
                image = source.convert("RGB")
    except (
        UnidentifiedImageError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
        OSError,
        ValueError,
    ):
        raise FloodAnalysisError("After image could not be decoded.", 400) from None

    expected_formats = {
        "image/png": {"PNG"},
        "image/jpeg": {"JPEG", "JPG"},
        "image/webp": {"WEBP"},
    }
    if source_format not in expected_formats[content_type]:
        raise FloodAnalysisError("After image format does not match its content type.", 400)
    return DecodedImage(
        image=image,
        width=image.width,
        height=image.height,
        format=source_format,
        original_mode=original_mode,
        byte_size=len(image_bytes),
    )


def _class_id(id_to_label: dict[Any, Any], accepted_labels: set[str]) -> int | None:
    for raw_id, raw_label in id_to_label.items():
        if str(raw_label).strip().lower() in accepted_labels:
            try:
                return int(raw_id)
            except (TypeError, ValueError):
                continue
    return None


def _preferred_device(torch: Any) -> str:
    if torch.cuda.is_available():
        return "cuda"
    mps = getattr(torch.backends, "mps", None)
    if mps and mps.is_available():
        return "mps"
    return "cpu"


def get_flood_model() -> tuple[Any, Any, str, str, str, int, int | None]:
    global _processor, _model, _model_device, _model_identifier, _model_revision
    global _water_class_id, _invalid_class_id

    with _model_lock:
        if _processor is not None and _model is not None and _water_class_id is not None:
            return (
                _processor,
                _model,
                _model_device,
                _model_identifier,
                _model_revision,
                _water_class_id,
                _invalid_class_id,
            )

        model_identifier = os.getenv("FLOOD_MODEL_ID", DEFAULT_MODEL_ID).strip()
        model_revision = os.getenv("FLOOD_MODEL_REVISION", DEFAULT_MODEL_REVISION).strip()
        if not model_identifier:
            raise FloodAnalysisError("Flood model checkpoint is not configured.", 503)

        try:
            import torch
            from transformers import AutoImageProcessor, SegformerForSemanticSegmentation

            processor = AutoImageProcessor.from_pretrained(
                model_identifier,
                revision=model_revision or None,
            )
            model = SegformerForSemanticSegmentation.from_pretrained(
                model_identifier,
                revision=model_revision or None,
            )
            water_class_id = _class_id(model.config.id2label, {"water", "flood", "flooded"})
            invalid_class_id = _class_id(model.config.id2label, {"invalid", "ignore", "unlabeled"})
            if water_class_id is None:
                raise FloodAnalysisError("Configured flood model has no water or flood output class.", 503)
            device = _preferred_device(torch)
            model.eval()
            model.to(device)
        except FloodAnalysisError:
            raise
        except Exception as error:
            logger.error(
                "Flood model failed to load identifier=%s error_type=%s",
                model_identifier,
                type(error).__name__,
            )
            raise FloodAnalysisError("Flood model failed to load. Check the configured checkpoint.", 503) from None

        _processor = processor
        _model = model
        _model_device = device
        _model_identifier = model_identifier
        _model_revision = model_revision
        _water_class_id = water_class_id
        _invalid_class_id = invalid_class_id
        logger.info("Flood model loaded architecture=SegFormer-B0 device=%s", device)
        return processor, model, device, model_identifier, model_revision, water_class_id, invalid_class_id


def calculate_flood_statistics(
    predicted_classes: np.ndarray,
    water_class_id: int,
    invalid_class_id: int | None,
) -> dict[str, int | float]:
    if predicted_classes.ndim != 2:
        raise FloodAnalysisError("Flood model returned an invalid segmentation mask.")
    valid_pixels = np.ones(predicted_classes.shape, dtype=bool)
    if invalid_class_id is not None:
        valid_pixels = predicted_classes != invalid_class_id
    flooded_pixels = (predicted_classes == water_class_id) & valid_pixels
    flood_pixel_count = int(np.count_nonzero(flooded_pixels))
    total_pixel_count = int(np.count_nonzero(valid_pixels))
    invalid_pixel_count = int(predicted_classes.size - total_pixel_count)
    coverage = (flood_pixel_count / total_pixel_count * 100) if total_pixel_count else 0.0
    return {
        "floodPixelCount": flood_pixel_count,
        "totalPixelCount": total_pixel_count,
        "invalidPixelCount": invalid_pixel_count,
        "floodCoveragePercent": round(coverage, 2),
    }


def create_flood_mask_image(binary_mask: np.ndarray) -> bytes:
    if binary_mask.ndim != 2:
        raise FloodAnalysisError("Flood mask generation failed.")
    rgba = np.zeros((*binary_mask.shape, 4), dtype=np.uint8)
    rgba[binary_mask.astype(bool)] = [34, 211, 238, 150]
    output = io.BytesIO()
    try:
        Image.fromarray(rgba, mode="RGBA").save(output, format="PNG", optimize=True)
    except (OSError, ValueError):
        raise FloodAnalysisError("Flood mask generation failed.") from None
    return output.getvalue()


def _infer(processor: Any, model: Any, device: str, image: Image.Image) -> tuple[np.ndarray, int, int, list[int]]:
    import torch
    import torch.nn.functional as functional

    inputs = processor(images=image, return_tensors="pt")
    pixel_values = inputs["pixel_values"]
    input_height, input_width = int(pixel_values.shape[-2]), int(pixel_values.shape[-1])
    model_inputs = {key: value.to(device) for key, value in inputs.items()}
    with torch.inference_mode():
        logits = model(**model_inputs).logits
        raw_output_shape = [int(size) for size in logits.shape]
        resized_logits = functional.interpolate(
            logits,
            size=(image.height, image.width),
            mode="bilinear",
            align_corners=False,
        )
        predicted_classes = resized_logits.argmax(dim=1)[0].to("cpu").numpy()
    return predicted_classes, input_width, input_height, raw_output_shape


def run_flood_segmentation(image_bytes: bytes, content_type: str) -> dict[str, Any]:
    global _model_device

    decoded = decode_image(image_bytes, content_type)
    processor, model, device, identifier, revision, water_class_id, invalid_class_id = get_flood_model()
    with _inference_lock:
        try:
            predicted_classes, input_width, input_height, raw_output_shape = _infer(
                processor, model, device, decoded.image
            )
        except RuntimeError as error:
            if device != "mps":
                logger.error("Flood inference failed device=%s error_type=%s", device, type(error).__name__)
                raise FloodAnalysisError("Flood model inference failed. Please try again.", 503) from None
            logger.warning("Flood inference is incompatible with MPS; retrying on CPU")
            try:
                model.to("cpu")
                _model_device = "cpu"
                device = "cpu"
                predicted_classes, input_width, input_height, raw_output_shape = _infer(
                    processor, model, device, decoded.image
                )
            except Exception as fallback_error:
                logger.error(
                    "Flood inference failed after CPU fallback error_type=%s",
                    type(fallback_error).__name__,
                )
                raise FloodAnalysisError("Flood model inference failed. Please try again.", 503) from None
        except Exception as error:
            logger.error("Flood inference failed device=%s error_type=%s", device, type(error).__name__)
            raise FloodAnalysisError("Flood model inference failed. Please try again.", 503) from None

    if predicted_classes.shape != (decoded.height, decoded.width):
        raise FloodAnalysisError("Flood model returned an incorrectly sized mask.")
    statistics = calculate_flood_statistics(predicted_classes, water_class_id, invalid_class_id)
    binary_mask = predicted_classes == water_class_id
    mask_bytes = create_flood_mask_image(binary_mask)
    return {
        "model": {
            "architecture": "SegFormer-B0",
            "identifier": identifier,
            "revision": revision,
            "device": device,
        },
        "image": {
            "width": decoded.width,
            "height": decoded.height,
            "format": decoded.format,
            "mode": decoded.image.mode,
            "byteSize": decoded.byte_size,
        },
        "processing": {
            "inputWidth": input_width,
            "inputHeight": input_height,
            "rawOutputShape": raw_output_shape,
        },
        "flood": statistics,
        "maskBytes": mask_bytes,
    }


def cache_flood_mask(mask_bytes: bytes) -> str:
    now = time.time()
    with _mask_lock:
        for mask_id, (created_at, _) in list(_mask_cache.items()):
            if now - created_at > MASK_TTL_SECONDS:
                _mask_cache.pop(mask_id, None)
        while len(_mask_cache) >= MAX_CACHED_MASKS:
            oldest = min(_mask_cache, key=lambda key: _mask_cache[key][0])
            _mask_cache.pop(oldest, None)
        mask_id = uuid.uuid4().hex
        _mask_cache[mask_id] = (now, mask_bytes)
    return f"/api/flood-analysis/mask/{mask_id}"


def get_cached_flood_mask(mask_id: str) -> bytes | None:
    with _mask_lock:
        cached = _mask_cache.get(mask_id)
        if not cached or time.time() - cached[0] > MASK_TTL_SECONDS:
            _mask_cache.pop(mask_id, None)
            return None
        return cached[1]
