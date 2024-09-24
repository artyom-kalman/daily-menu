package entities

type Menu struct {
	Items []*MenuItem
}

type MenuItem struct {
	Name        string
	Description string
}
