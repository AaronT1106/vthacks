"""Flood segmentation tests. The real model is never downloaded by this suite."""

import asyncio
import io
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
from fastapi import HTTPException, UploadFile
from fastapi.testclient import TestClient
from PIL import Image

import flood_segmentation
from flood_segmentation import (
    FloodAnalysisError,
    _class_id,
    calculate_flood_statistics,
    cache_flood_mask,
    create_flood_mask_image,
    decode_image,
    get_cached_flood_mask,
    run_flood_segmentation,
)
from main import analyze_flood, app
from satellite_imagery import _cache_preview


def image_bytes(format_name: str = "PNG", size: tuple[int, int] = (4, 3)) -> bytes:
    output = io.BytesIO()
    Image.new("RGB", size, (20, 80, 120)).save(output, format=format_name)
    return output.getvalue()


def mocked_segmentation_result(width: int = 4, height: int = 3) -> dict:
    return {
        "model": {
            "architecture": "SegFormer-B0",
            "identifier": flood_segmentation.DEFAULT_MODEL_ID,
            "revision": flood_segmentation.DEFAULT_MODEL_REVISION,
            "device": "cpu",
        },
        "image": {
            "width": width,
            "height": height,
            "format": "PNG",
            "mode": "RGB",
            "byteSize": 77,
        },
        "processing": {
            "inputWidth": 512,
            "inputHeight": 512,
            "rawOutputShape": [1, 3, 128, 128],
        },
        "flood": {
            "floodPixelCount": 2,
            "totalPixelCount": width * height,
            "invalidPixelCount": 0,
            "floodCoveragePercent": round(2 / (width * height) * 100, 2),
        },
        "maskBytes": image_bytes("PNG", (width, height)),
    }


class FloodSegmentationUnitTests(unittest.TestCase):
    def test_decodes_supported_image_pixels(self):
        for format_name, content_type in (("PNG", "image/png"), ("JPEG", "image/jpeg"), ("WEBP", "image/webp")):
            with self.subTest(format_name=format_name):
                decoded = decode_image(image_bytes(format_name, (7, 5)), content_type)
                self.assertEqual((decoded.width, decoded.height), (7, 5))
                self.assertEqual(decoded.image.mode, "RGB")
                self.assertGreater(decoded.byte_size, 0)

    def test_rejects_unsupported_and_malformed_images(self):
        with self.assertRaisesRegex(FloodAnalysisError, "Unsupported"):
            decode_image(b"pdf", "application/pdf")
        with self.assertRaisesRegex(FloodAnalysisError, "could not be decoded"):
            decode_image(b"not an image", "image/png")
        with self.assertRaisesRegex(FloodAnalysisError, "does not match"):
            decode_image(image_bytes("PNG"), "image/jpeg")

    def test_rejects_decompression_bomb_warning(self):
        with patch.object(Image, "MAX_IMAGE_PIXELS", 4):
            with self.assertRaisesRegex(FloodAnalysisError, "could not be decoded"):
                decode_image(image_bytes("PNG", (3, 3)), "image/png")

    def test_statistics_count_flood_and_exclude_invalid_pixels(self):
        predicted = np.array([[1, 2], [2, 1]], dtype=np.int64)
        self.assertEqual(calculate_flood_statistics(predicted, 2, None), {
            "floodPixelCount": 2,
            "totalPixelCount": 4,
            "invalidPixelCount": 0,
            "floodCoveragePercent": 50.0,
        })
        with_invalid = np.array([[0, 2], [2, 1]], dtype=np.int64)
        self.assertEqual(calculate_flood_statistics(with_invalid, 2, 0), {
            "floodPixelCount": 2,
            "totalPixelCount": 3,
            "invalidPixelCount": 1,
            "floodCoveragePercent": 66.67,
        })

    def test_class_mapping_uses_labels_instead_of_assuming_an_id(self):
        labels = {0: "invalid", 4: "not water", 9: "water"}
        self.assertEqual(_class_id(labels, {"water", "flood"}), 9)
        self.assertEqual(_class_id(labels, {"invalid", "unlabeled"}), 0)

    def test_mask_png_has_original_dimensions_and_transparency(self):
        mask = np.array([[0, 1], [1, 0]], dtype=np.uint8)
        png = create_flood_mask_image(mask)
        with Image.open(io.BytesIO(png)) as rendered:
            self.assertEqual(rendered.size, (2, 2))
            self.assertEqual(rendered.mode, "RGBA")
            self.assertEqual(rendered.getpixel((0, 0))[3], 0)
            self.assertGreater(rendered.getpixel((1, 0))[3], 0)

    def test_model_load_and_inference_failures_are_safe(self):
        valid_png = image_bytes()
        with patch("flood_segmentation.get_flood_model", side_effect=FloodAnalysisError("Flood model failed to load.", 503)):
            with self.assertRaisesRegex(FloodAnalysisError, "failed to load"):
                run_flood_segmentation(valid_png, "image/png")

        fake_model = MagicMock()
        with (
            patch("flood_segmentation.get_flood_model", return_value=(MagicMock(), fake_model, "cpu", "model", "rev", 2, 0)),
            patch("flood_segmentation._infer", side_effect=RuntimeError("failure")),
        ):
            with self.assertRaisesRegex(FloodAnalysisError, "inference failed"):
                run_flood_segmentation(valid_png, "image/png")

    def test_mask_cache_expires(self):
        mask_url = cache_flood_mask(image_bytes())
        mask_id = mask_url.rsplit("/", 1)[-1]
        self.assertIsNotNone(get_cached_flood_mask(mask_id))
        created_at, content = flood_segmentation._mask_cache[mask_id]
        flood_segmentation._mask_cache[mask_id] = (
            created_at - flood_segmentation.MASK_TTL_SECONDS - 1,
            content,
        )
        self.assertIsNone(get_cached_flood_mask(mask_id))


class FloodAnalysisApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.bounds = {"west": "-80.45", "south": "37.20", "east": "-80.40", "north": "37.25"}

    @patch("main.run_flood_segmentation", side_effect=lambda *_: mocked_segmentation_result())
    def test_manual_after_image_returns_real_analysis_shape(self, run_segmentation):
        response = self.client.post(
            "/api/analyze-flood",
            data={**self.bounds, "source": "manual"},
            files={"after_image": ("after.png", image_bytes(), "image/png")},
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "success")
        self.assertEqual(body["analysisType"], "flood_segmentation")
        self.assertEqual(body["mask"]["width"], body["image"]["width"])
        self.assertEqual(body["mask"]["height"], body["image"]["height"])
        self.assertEqual(body["acquisition"]["source"], "manual")
        self.assertEqual(body["acquisition"]["filename"], "after.png")
        run_segmentation.assert_called_once()

    @patch("main.run_flood_segmentation", side_effect=lambda *_: mocked_segmentation_result())
    def test_satellite_analysis_retains_exact_acquisition_metadata(self, _run_segmentation):
        bbox = [-80.45, 37.20, -80.40, 37.25]
        preview_url = _cache_preview(
            image_bytes(),
            "image/png",
            bbox,
            "S2-after-scene",
            "2026-09-14T16:23:09.795Z",
            7.25,
        )
        response = self.client.post("/api/analyze-flood", data={
            **self.bounds,
            "source": "satellite",
            "after_preview_id": preview_url.rsplit("/", 1)[-1],
        })
        self.assertEqual(response.status_code, 200)
        acquisition = response.json()["acquisition"]
        self.assertEqual(acquisition["sceneId"], "S2-after-scene")
        self.assertEqual(acquisition["capturedAt"], "2026-09-14T16:23:09.795000Z")
        self.assertEqual(acquisition["cloudCoverage"], 7.25)
        self.assertEqual(acquisition["bbox"], bbox)

    def test_rejects_expired_mismatched_and_invalid_inputs_without_model_download(self):
        expired = self.client.post("/api/analyze-flood", data={
            **self.bounds,
            "source": "satellite",
            "after_preview_id": "f" * 32,
        })
        self.assertEqual(expired.status_code, 404)

        preview_url = _cache_preview(
            image_bytes(), "image/png", [-80.0, 37.0, -79.9, 37.1], "scene", "2026-09-14T16:23:09Z", 5,
        )
        mismatch = self.client.post("/api/analyze-flood", data={
            **self.bounds,
            "source": "satellite",
            "after_preview_id": preview_url.rsplit("/", 1)[-1],
        })
        self.assertEqual(mismatch.status_code, 409)

        unsupported = self.client.post(
            "/api/analyze-flood",
            data={**self.bounds, "source": "manual"},
            files={"after_image": ("after.pdf", b"pdf", "application/pdf")},
        )
        self.assertEqual(unsupported.status_code, 400)
        malformed = self.client.post(
            "/api/analyze-flood",
            data={**self.bounds, "source": "manual"},
            files={"after_image": ("after.png", b"broken", "image/png")},
        )
        self.assertEqual(malformed.status_code, 400)

    def test_invalid_bounds_and_missing_source_fields(self):
        for changed_bounds in (
            {"east": self.bounds["west"]},
            {"east": "-80.50"},
            {"north": self.bounds["south"]},
            {"north": "37.10"},
        ):
            with self.subTest(changed_bounds=changed_bounds):
                invalid_bounds = self.client.post(
                    "/api/analyze-flood",
                    data={**self.bounds, **changed_bounds, "source": "manual"},
                    files={"after_image": ("after.png", image_bytes(), "image/png")},
                )
                self.assertEqual(invalid_bounds.status_code, 400)
        self.assertEqual(
            self.client.post("/api/analyze-flood", data={**self.bounds, "source": "manual"}).status_code,
            400,
        )
        self.assertEqual(
            self.client.post("/api/analyze-flood", data={**self.bounds, "source": "satellite"}).status_code,
            400,
        )

    @patch("main.run_flood_segmentation", side_effect=lambda *_: mocked_segmentation_result())
    def test_negative_latitude_bounds_are_valid(self, _run_segmentation):
        response = self.client.post(
            "/api/analyze-flood",
            data={"west": "18.40", "south": "-34.10", "east": "18.50", "north": "-34.00", "source": "manual"},
            files={"after_image": ("after.webp", image_bytes("WEBP"), "image/webp")},
        )
        self.assertEqual(response.status_code, 200)

    def test_upload_handle_closes_after_success_and_failure(self):
        successful_upload = UploadFile(filename="after.png", file=io.BytesIO(image_bytes()), headers={"content-type": "image/png"})
        with patch("main.run_in_threadpool", new=AsyncMock(return_value=mocked_segmentation_result())):
            asyncio.run(analyze_flood("manual", -80.45, 37.2, -80.4, 37.25, successful_upload, None))
        self.assertTrue(successful_upload.file.closed)

        failed_upload = UploadFile(filename="after.png", file=io.BytesIO(b"broken"), headers={"content-type": "image/png"})
        with patch("main.run_in_threadpool", new=AsyncMock(side_effect=FloodAnalysisError("decode failed", 400))):
            with self.assertRaises(HTTPException):
                asyncio.run(analyze_flood("manual", -80.45, 37.2, -80.4, 37.25, failed_upload, None))
        self.assertTrue(failed_upload.file.closed)

    def test_mask_endpoint_serves_png_and_missing_mask_is_404(self):
        mask_url = cache_flood_mask(image_bytes())
        response = self.client.get(mask_url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "image/png")
        self.assertEqual(self.client.get(f"/api/flood-analysis/mask/{'a' * 32}").status_code, 404)


if __name__ == "__main__":
    unittest.main()
