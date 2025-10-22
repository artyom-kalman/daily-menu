package menu

import (
	"encoding/json"
	"time"

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

func (r *MenuRepository) GetMenu(cafeteria string, targetDate time.Time) ([]*MenuItem, error) {
	selectQuery := "SELECT dishes FROM menu WHERE cafeteria = $1 AND date = $2"
	rows, err := r.db.Conn.Query(selectQuery, cafeteria, targetDate.Format("2006-01-02"))
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

func (r *MenuRepository) SaveMenu(cafeteria string, dishes []*MenuItem, targetDate time.Time) error {
	dishesJSON, err := json.Marshal(dishes)
	if err != nil {
		return err
	}

	insertQuery := `
		INSERT INTO menu (date, cafeteria, dishes)
		VALUES ($1, $2, $3)
		ON CONFLICT(date, cafeteria) DO UPDATE SET dishes = excluded.dishes
	`
	_, err = r.db.Conn.Exec(insertQuery, targetDate.Format("2006-01-02"), cafeteria, string(dishesJSON))
	if err != nil {
		return err
	}

	return nil
}
