CREATE TABLE menu (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    cafeteria STRING NOT NULL,
    dishes JSON
);
