package menudescription

import (
	"fmt"

	"github.com/artyom-kalman/kbu-daily-menu/internal/domain"
)

func generatePromtForMenu(menu *domain.Menu) string {
	menuPrompt := "Опиши блюда. Ответ дай в виде json: name: название на русском, description: описание, spiciness: степень остроты от 1 до 5. Вот список блюд: "
	for _, item := range menu.Items {
		menuPrompt += fmt.Sprintf("%s, ", item.Name)
	}
	return menuPrompt
}
