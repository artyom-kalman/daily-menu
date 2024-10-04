package cafeteria

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
