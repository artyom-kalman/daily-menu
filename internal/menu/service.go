package menu

import "github.com/artyom-kalman/kbu-daily-menu/internal/ai"

type AIService interface {
	SendRequest(messages []*ai.Message) (any, error)
}

type MenuAIService struct {
	chatgpt    AIService
	jsonParser *JSONParser
}

func NewMenuAIService(gptService AIService) *MenuAIService {
	return &MenuAIService{
		chatgpt:    gptService,
		jsonParser: NewJSONParser(),
	}
}

func (service *MenuAIService) GenerateDescriptions(menu *Menu) error {
	menuPrompt := service.generatePrompt(menu)
	messages := []*ai.Message{
		{Role: "system", Content: "Ты - полезный помощник для генерации описаний меню."},
		{Role: "user", Content: menuPrompt},
	}

	response, err := service.chatgpt.SendRequest(messages)
	if err != nil {
		return err
	}

	items, err := service.jsonParser.ParseMenuItems(response.(string))
	if err != nil {
		return err
	}

	menu.Items = items
	return nil
}

func (service *MenuAIService) generatePrompt(menu *Menu) string {
	menuPrompt := "Опиши блюда. В ответе отправь только json без какой-либо дополнительной информации: name: название на корейском, description: название на русском"
	for _, item := range menu.Items {
		menuPrompt += item.Name + ", "
	}
	return menuPrompt
}
