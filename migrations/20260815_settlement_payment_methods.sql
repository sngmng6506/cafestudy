CREATE TABLE settlement_payment_methods (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  bank_name text,
  bank_account_number text,
  account_holder_name text,
  kakaopay_link text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (bank_name IS NULL AND bank_account_number IS NULL AND account_holder_name IS NULL)
    OR (bank_name IS NOT NULL AND bank_account_number IS NOT NULL AND account_holder_name IS NOT NULL)
  )
);

ALTER TABLE meetup_settlements
  ADD COLUMN payer_bank_name text,
  ADD COLUMN payer_bank_account_number text,
  ADD COLUMN payer_account_holder_name text,
  ADD COLUMN payer_kakaopay_link text,
  ADD CONSTRAINT meetup_settlements_payer_bank_consistency CHECK (
    (payer_bank_name IS NULL AND payer_bank_account_number IS NULL AND payer_account_holder_name IS NULL)
    OR (payer_bank_name IS NOT NULL AND payer_bank_account_number IS NOT NULL AND payer_account_holder_name IS NOT NULL)
  );

ALTER TABLE meetup_settlement_participants
  ADD COLUMN paid_at timestamptz;
