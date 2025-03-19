package menudescription

import (
	"fmt"

	"github.com/artyom-kalman/kbu-daily-menu/internal/domain"
)

func generatePromtForMenu(menu *domain.Menu) string {
	// menuPrompt := "Опиши блюда. В ответе отправь только json без какой-либо дополнительной информации: name: название на русском, description: описание, spiciness: степень остроты от 1 до 5. Вот список блюд: "
	menuPrompt := "Опиши блюда. В ответе отправь только json без какой-либо дополнительной информации: name: название на корейском, description: название на русском"
	for _, item := range menu.Items {
		menuPrompt += fmt.Sprintf("%s, ", item.Name)
	}
	return menuPrompt
}
