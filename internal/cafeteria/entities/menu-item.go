package entities

type MenuItem struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Spiciness   int    `json:"spiciness"`
}

func (i *MenuItem) AddDescription(description string) {
	i.Description = description
}

func (i *MenuItem) AddSpiciness(spiciness int) {
	i.Spiciness = spiciness
}
