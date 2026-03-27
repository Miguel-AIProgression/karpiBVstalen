-- Voorkom dubbele bundels per order
ALTER TABLE order_lines ADD CONSTRAINT order_lines_order_bundle_unique UNIQUE (order_id, bundle_id);
