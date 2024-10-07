package entities

import "fmt"

type Menu struct {
	Items []*MenuItem
}

func NewMenuFromDishes(dishes []string) *Menu {
	menu := Menu{
		Items: make([]*MenuItem, len(dishes)),
	}
	for i, dish := range dishes {
		menu.Items[i] = &MenuItem{
			Name:        dish,
			Description: "TODO",
		}
	}
	return &menu
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
