package menudescription

import (
	"github.com/artyom-kalman/kbu-daily-menu/internal/domain"
	"github.com/artyom-kalman/kbu-daily-menu/internal/services/chatgpt"
)

type MenuDescriptionService struct {
	chatgpt *chatgpt.GptService
}

func NewDescriptionService(gptService *chatgpt.GptService) *MenuDescriptionService {
	return &MenuDescriptionService{
		chatgpt: gptService,
	}
}

func (mds *MenuDescriptionService) AddDescriptionToMenu(menu *domain.Menu) error {
	prompt := generatePromtForMenu(menu)

	items, err := mds.chatgpt.SendRequest(prompt)
	if err != nil {
		return err
	}

	menu.Items = items

	return nil
}
