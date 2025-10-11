package menu

import (
	"encoding/json"
	"fmt"

	"github.com/artyom-kalman/kbu-daily-menu/internal/database"
)

type MenuRepository struct {
	db *database.Database
}

func NewMenuRepository(d *database.Database) *MenuRepository {
	return &MenuRepository{
		db: d,
	}
}

func (r *MenuRepository) GetMenu(cafeteria string) ([]*MenuItem, error) {
	err := r.db.Connect()
	if err != nil {
		return nil, err
	}
	defer r.db.Close()

	selectQuery := fmt.Sprintf("SELECT dishes FROM menu WHERE cafeteria = '%s' AND date = DATE('now');", cafeteria)
	rows, err := r.db.Conn.Query(selectQuery)
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

	var dishes []*MenuItem
	err = json.Unmarshal([]byte(dishesJson), &dishes)
	if err != nil {
		return nil, err
	}

	return dishes, nil
}

func (r *MenuRepository) SaveMenu(cafeteria string, dishes []*MenuItem) error {
	err := r.db.Connect()
	if err != nil {
		return err
	}
	defer r.db.Close()

	dishesJson, err := json.Marshal(dishes)
	if err != nil {
		return err
	}

	insertQuery := "INSERT INTO menu (cafeteria, dishes, date) VALUES ($1, $2, DATE('now'))"
	_, err = r.db.Conn.Exec(insertQuery, cafeteria, string(dishesJson))
	if err != nil {
		return err
	}

	return nil
}
