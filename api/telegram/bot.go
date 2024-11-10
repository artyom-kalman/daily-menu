package telegram

import (
	"os"

	"github.com/artyom-kalman/kbu-daily-menu/config"
	"github.com/artyom-kalman/kbu-daily-menu/internal/application/bot"
)

func RunBot() {
	token := os.Getenv("KBUDAILYMENU_TGBOT_TOKEN")
	if token == "" {
		panic("Set bot token")
	}

	bot, err := bot.NewBot(token)
	if err != nil {
		panic(err)
	}

	menuService, err := config.GetMenuService()
	if err != nil {
		panic(err)
	}

	message, err := menuService.GetMenuString()
	if err != nil {
		message = "Произошла ошибка"
	}
	myChatId := 734130728
	bot.ScheduleDailyMenu(myChatId, message, "10:00")

	go bot.HandleMessages(message)
}
