package entities

type Menu struct {
	Items []*MenuItem
}

type MenuItem struct {
	Name        string
	Description string
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
