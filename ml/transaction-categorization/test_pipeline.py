import unittest
from pipeline import aggregate_weak_labels, normalize
from evaluation import classification_metrics, temporal_split


class PipelineTest(unittest.TestCase):
    def test_normalization_separates_handle_and_reference(self):
        result = normalize("UPI/food@okaxis Ref 123456789 paid Rs. 250.00")
        self.assertEqual(result.merchant_handle, "food@okaxis")
        self.assertEqual(result.reference, "123456789")
        self.assertNotIn("250", result.text)

    def test_conflict_abstains(self):
        result = aggregate_weak_labels((("merchant", "food_dining"), ("intent", "transfer")))
        self.assertIsNone(result.category)
        self.assertTrue(result.requires_confirmation)

    def test_consensus_is_explainable(self):
        result = aggregate_weak_labels((("merchant", "food_dining"), ("biller", "food_dining"), ("other", None)))
        self.assertEqual(result.category, "food_dining")
        self.assertEqual(result.evidence, ("merchant", "biller"))

    def test_temporal_split_has_no_overlap(self):
        rows = [{"date": f"2026-01-{n:02d}", "id": n} for n in range(1, 11)]
        train, test = temporal_split(rows)
        self.assertLess(train[-1]["date"], test[0]["date"])

    def test_metrics_include_abstention(self):
        scores = classification_metrics(["food_dining", "shopping"], ["food_dining", None], ["food_dining", "shopping"])
        self.assertEqual(scores["abstention_rate"], 0.5)


if __name__ == "__main__":
    unittest.main()
