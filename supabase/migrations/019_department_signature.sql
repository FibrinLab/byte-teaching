-- Add teaching lead info to departments for certificate generation
ALTER TABLE departments ADD COLUMN lead_name TEXT;
ALTER TABLE departments ADD COLUMN signature_data TEXT;
