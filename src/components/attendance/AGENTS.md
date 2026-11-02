# attendance UI rules
- Student cards are auto-issued by DB triggers on student insert/activation and enrollment (_auto_card); tokens are 10 random digits (_new_card_code) so the CODE128 barcode stays short and scannable. issue_student_card without a reason returns the existing card; a replacement needs a reason.
- scanner.tsx: BarcodeDetector (code_128/qr/code_39/ean_13) with ZXing fallback; scans are queued, never dropped; the same code is ignored for 2s; nothing is recorded until server_now is verified.
