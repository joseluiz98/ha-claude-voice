import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import conversations as conv  # noqa: E402


class TestParse(unittest.TestCase):
    def test_parse_valid_and_corrupt(self):
        text = '{"ts":"2026-06-24T00:00:00Z","ok":true}\n' "not json\n" "\n" '{"ts":"2026-06-24T00:01:00Z","ok":false}\n'
        records, unreadable = conv.parse_ndjson(text)
        self.assertEqual(len(records), 2)
        self.assertEqual(unreadable, 1)

    def test_parse_non_dict_counts_unreadable(self):
        records, unreadable = conv.parse_ndjson("[1,2,3]\n42\n")
        self.assertEqual(records, [])
        self.assertEqual(unreadable, 2)

    def test_read_day_missing_file(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(conv.read_day(d, "2099-01-01"), ([], 0))

    def test_read_day_reads_file(self):
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "2026-06-24.ndjson"), "w", encoding="utf-8") as fh:
                fh.write('{"ts":"2026-06-24T00:00:00Z","prompt":"oi"}\n')
            records, unreadable = conv.read_day(d, "2026-06-24")
            self.assertEqual(len(records), 1)
            self.assertEqual(records[0]["prompt"], "oi")
            self.assertEqual(unreadable, 0)

    def test_list_dates(self):
        with tempfile.TemporaryDirectory() as d:
            for n in ("2026-06-23.ndjson", "2026-06-24.ndjson", "ignore.txt"):
                open(os.path.join(d, n), "w").close()
            self.assertEqual(conv.list_dates(d), ["2026-06-23", "2026-06-24"])

    def test_list_conversations_shape(self):
        with tempfile.TemporaryDirectory() as d:
            open(os.path.join(d, "2026-06-24.ndjson"), "w").close()
            out = conv.list_conversations(d, "2026-06-24")
            self.assertEqual(set(out.keys()), {"records", "unreadable", "dates_available"})

    def test_read_range_concats_inclusive(self):
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "2026-06-23.ndjson"), "w", encoding="utf-8") as fh:
                fh.write('{"ts":"2026-06-23T10:00:00Z"}\n')
            with open(os.path.join(d, "2026-06-24.ndjson"), "w", encoding="utf-8") as fh:
                fh.write('{"ts":"2026-06-24T10:00:00Z"}\nbroken\n')
            records, unreadable = conv.read_range(d, "2026-06-23", "2026-06-24")
            self.assertEqual(len(records), 2)
            self.assertEqual(unreadable, 1)

    def test_read_range_swaps_inverted_dates(self):
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "2026-06-23.ndjson"), "w", encoding="utf-8") as fh:
                fh.write('{"ts":"2026-06-23T10:00:00Z"}\n')
            records, _ = conv.read_range(d, "2026-06-24", "2026-06-23")
            self.assertEqual(len(records), 1)

    def test_read_range_missing_days_ok(self):
        with tempfile.TemporaryDirectory() as d:
            records, unreadable = conv.read_range(d, "2026-06-01", "2026-06-03")
            self.assertEqual((records, unreadable), ([], 0))

    def test_read_range_caps_window(self):
        with tempfile.TemporaryDirectory() as d:
            # janela de ~2 anos é clampada a MAX_RANGE_DAYS sem estourar
            records, unreadable = conv.read_range(d, "2024-01-01", "2026-01-01")
            self.assertEqual((records, unreadable), ([], 0))


if __name__ == "__main__":
    unittest.main()
