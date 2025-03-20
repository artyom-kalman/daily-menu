package bot

import (
	"fmt"

	"github.com/artyom-kalman/kbu-daily-menu/config"
)

func (b *Bot) Run() error {
	menuService, err := config.GetMenuService()
	if err != nil {
		return err
	}

	message, err := menuService.GetMenuString()
	if err != nil {
		return fmt.Errorf("error getting menu string: %w", err)
	}

	myChatId := 734130728
	b.ScheduleDailyMenu(myChatId, message, "8:00")

	go b.HandleMessages(message)

	return nil
}
