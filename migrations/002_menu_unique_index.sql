CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_date_cafeteria
ON menu(date, cafeteria);
