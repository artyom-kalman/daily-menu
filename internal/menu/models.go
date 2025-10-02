package menu

import (
	"fmt"
	"time"
)

type Cafeteria string

const (
	emptyMenuMessage = "Сегодня тут пусто"
)

const (
	PEONY  Cafeteria = "peony"
	AZILEA Cafeteria = "azilea"
)

type Menu struct {
	Items []*MenuItem `json:"dishes"`
	Time  *time.Time
}

type MenuItem struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Spiciness   int    `json:"spiciness"`
}

func NewMenu(items []*MenuItem, time *time.Time) *Menu {
	return &Menu{
		Items: items,
		Time:  time,
	}
}

func NewMenuFromDishes(dishes []string, time *time.Time) *Menu {
	menu := Menu{
		Items: make([]*MenuItem, len(dishes)),
		Time:  time,
	}

	for i, dish := range dishes {
		menu.Items[i] = &MenuItem{
			Name:        dish,
			Description: "TODO",
		}
	}
	return &menu
}

func (m *Menu) Date() *time.Time {
	truncatedDate := m.Time.Truncate(24 * time.Hour)
	return &truncatedDate
}

func (m *Menu) String() string {
	if len(m.Items) == 1 {
		return "Не удалось получить меню"
	}

	str := ""
	for i, item := range m.Items {
		str += fmt.Sprintf("%d) %s. %s", i+1, item.Name, item.Description)
	}
	return str
}

func (i *MenuItem) AddDescription(description string) {
	i.Description = description
}

func (i *MenuItem) AddSpiciness(spiciness int) {
	i.Spiciness = spiciness
}
