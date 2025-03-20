package menudescription

import (
	"github.com/artyom-kalman/kbu-daily-menu/internal/domain"
	"github.com/artyom-kalman/kbu-daily-menu/internal/services/chatgpt"
)

type MenuDescriptionService struct {
	chatgpt *chatgpt.GptService
}

func New(gptService *chatgpt.GptService) *MenuDescriptionService {
	return &MenuDescriptionService{
		chatgpt: gptService,
	}
}

func (service *MenuDescriptionService) AddDescriptionToMenu(menu *domain.Menu) error {
	menuPrompt := generatePromtForMenu(menu)
	messages := []*chatgpt.Message{
		{Role: "system", Content: "Ты - полезный помощник для генерации описаний меню."},
		{Role: "user", Content: menuPrompt},
	}

	items, err := service.chatgpt.SendRequest(messages)
	if err != nil {
		return err
	}

	menu.Items = items

	return nil
}
