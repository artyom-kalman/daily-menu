package domain

import (
	"fmt"
	"time"
)

type Menu struct {
	Items []*MenuItem `json:"dishes"`
	Time  *time.Time
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
