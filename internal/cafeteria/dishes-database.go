package cafeteria

import (
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/artyom-kalman/kbu-daily-menu/internal/cafeteria/entities"
	_ "github.com/mattn/go-sqlite3"
)

type DishesDatabase struct {
	connection *sql.DB
	path       string
}

func NewMenuDatabase(path string) *DishesDatabase {
	return &DishesDatabase{
		path: path,
	}
}

func (db *DishesDatabase) Connect() error {
	conn, err := sql.Open("sqlite3", db.path)
	if err != nil {
		return err
	}

	db.connection = conn
	return nil
}

func (db *DishesDatabase) Close() error {
	return db.connection.Close()
}

func (db *DishesDatabase) SelectRow(cafeteria string) ([]*entities.MenuItem, error) {
	err := db.Connect()
	if err != nil {
		return nil, err
	}
	defer db.Close()

	selectQuery := fmt.Sprintf("SELECT dishes FROM menu WHERE cafeteria = '%s' AND date = DATE('now');", cafeteria)
	rows, err := db.connection.Query(selectQuery)
	if err != nil {
		return nil, err
	}

	if !rows.Next() {
		return nil, nil
	}

	var dishesJson string
	err = rows.Scan(&dishesJson)
	if err != nil {
		return nil, err
	}

	var dishes []*entities.MenuItem
	err = json.Unmarshal([]byte(dishesJson), &dishes)
	if err != nil {
		return nil, err
	}

	return dishes, nil
}

func (db *DishesDatabase) UpdateDishes(cafeteria string, dishes []*entities.MenuItem) error {
	err := db.Connect()
	if err != nil {
		return err
	}
	defer db.Close()

	dishesJson, err := json.Marshal(dishes)
	if err != nil {
		return err
	}

	updateQuery := fmt.Sprintf("UPDATE menu SET dishes = '%s', date = DATE('now') WHERE cafeteria = '%s';", string(dishesJson), cafeteria)
	_, err = db.connection.Exec(updateQuery)
	if err != nil {
		return err
	}

	return nil
}
