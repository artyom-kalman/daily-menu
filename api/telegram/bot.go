package telegram

import (
	"fmt"

	"github.com/artyom-kalman/kbu-daily-menu/config"
	"github.com/artyom-kalman/kbu-daily-menu/internal/application/bot"
)

func RunBot() error {
	token, err := config.GetEnv("TELEGRAM_BOT")
	if err != nil {
		return err
	}

	bot, err := bot.NewBot(token)
	if err != nil {
		return err
	}

	menuService, err := config.GetMenuService()
	if err != nil {
		return err
	}

	message, err := menuService.GetMenuString()
	if err != nil {
		return fmt.Errorf("error getting menu string: %w", err)
	}
	myChatId := 734130728
	bot.ScheduleDailyMenu(myChatId, message, "10:00")

	go bot.HandleMessages(message)

	return nil
}
