import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from phase import resolve  # noqa: E402


class PhaseTable(unittest.TestCase):
    def check(self, title, base, phase, card, file):
        got = resolve(title=title)
        self.assertEqual((got["base"], got["phase"], got["card_title"], got["file"]),
                         (base, phase, card, file), title)

    def test_no_suffix_is_h1(self):
        self.check("Естафета хендофів", "Естафета хендофів", 1,
                   "Естафета хендофів H2", "Естафета хендофів — H2.md")

    def test_h2_goes_to_h3(self):
        self.check("Естафета хендофів H2", "Естафета хендофів", 2,
                   "Естафета хендофів H3", "Естафета хендофів — H3.md")

    def test_h10_goes_to_h11(self):
        self.check("Назва H10", "Назва", 10, "Назва H11", "Назва — H11.md")

    def test_h2o_is_not_phase(self):
        self.check("H2O тест", "H2O тест", 1, "H2O тест H2", "H2O тест — H2.md")

    def test_glued_suffix_is_not_phase(self):
        self.check("ТестH2", "ТестH2", 1, "ТестH2 H2", "ТестH2 — H2.md")

    def test_lowercase_h_is_not_phase(self):
        self.check("Назва h2", "Назва h2", 1, "Назва h2 H2", "Назва h2 — H2.md")

    def test_h0_is_not_phase(self):
        self.check("Назва H0", "Назва H0", 1, "Назва H0 H2", "Назва H0 — H2.md")

    def test_long_base_truncated_suffix_kept(self):
        base = "Дуже довга назва сесії, яка точно не влазить у шістдесят символів"
        got = resolve(title=base + " H9")
        self.assertEqual(got["base"], base)
        self.assertLessEqual(len(got["card_title"]), 60)
        self.assertTrue(got["card_title"].endswith("… H10"))
        self.assertEqual(got["file"], base + " — H10.md")

    def test_exactly_60_not_truncated(self):
        base = "x" * 57
        self.assertEqual(resolve(title=base)["card_title"], base + " H2")

    def test_forbidden_chars_in_file_only(self):
        got = resolve(title="Plan: A/B тест H3")
        self.assertEqual(got["card_title"], "Plan: A/B тест H4")
        self.assertEqual(got["file"], "Plan- A-B тест — H4.md")
        self.assertEqual(got["previous"], "Plan- A-B тест — H3.md")

    def test_explicit_chain_wins_over_title(self):
        got = resolve(title="перейменована сесія", chain="Естафета хендофів", phase=3)
        self.assertEqual((got["base"], got["phase"], got["file"]),
                         ("Естафета хендофів", 3, "Естафета хендофів — H4.md"))

    def test_previous_only_from_h2(self):
        self.assertIsNone(resolve(title="Назва")["previous"])
        self.assertEqual(resolve(title="Назва H2")["previous"], "Назва — H2.md")

    def test_previous_exists_checked_on_disk(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertFalse(resolve(title="Назва H2", handoffs_dir=d)["previous_exists"])
            open(os.path.join(d, "Назва — H2.md"), "w").close()
            self.assertTrue(resolve(title="Назва H2", handoffs_dir=d)["previous_exists"])

    def test_empty_title_rejected(self):
        with self.assertRaises(ValueError):
            resolve(title="   ")


if __name__ == "__main__":
    unittest.main()
