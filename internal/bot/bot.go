package bot

import (
	"fmt"
	"time"

	"github.com/artyom-kalman/kbu-daily-menu/config"
	"github.com/artyom-kalman/kbu-daily-menu/internal/menu"
	"github.com/artyom-kalman/kbu-daily-menu/pkg/logger"
	"github.com/go-co-op/gocron"
	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
)

type Bot struct {
	bot *tgbotapi.BotAPI
}

func NewBot(token string) (*Bot, error) {
	bot, err := tgbotapi.NewBotAPI(token)
	if err != nil {
		return nil, err
	}

	return &Bot{
		bot: bot,
	}, nil
}

func (b *Bot) SendMessage(chatId int, text string) error {
	message := tgbotapi.NewMessage(int64(chatId), text)

	_, err := b.bot.Send(message)

	return err
}

func (b *Bot) ScheduleDailyMenu(chatId int, menu string, messageTime string) {
	scheduler := gocron.NewScheduler(time.Local)
	scheduler.Every(1).Day().At(messageTime).Do(func() {
		b.SendMessage(chatId, menu)
	})
	scheduler.StartAsync()

	logger.Info("Scheduled a daily message for chat %d", chatId)
}

func (b *Bot) HandleMessages(text string) error {
	updateConf := tgbotapi.NewUpdate(0)
	updateConf.Timeout = 60

	updates := b.bot.GetUpdatesChan(updateConf)
	for update := range updates {
		if update.Message == nil {
			continue
		}

		msg := tgbotapi.NewMessage(update.Message.Chat.ID, text)
		_, err := b.bot.Send(msg)
		if err != nil {
			return err
		}
	}
	return nil
}

func FormatMenuMessage(peony, azilea *menu.Menu) string {
	return fmt.Sprintf("Вот меню на сегодня.\nPeony (нижняя):\n%s\nAzilea (вехняя):\n%s", peony.String(), azilea.String())
}

func (b *Bot) Run() error {
	menuService, err := config.MenuService()
	if err != nil {
		return err
	}

	peony, azilea, err := menuService.GetMenus()
	if err != nil {
		return fmt.Errorf("error getting menus: %w", err)
	}

	message := FormatMenuMessage(peony, azilea)

	myChatId := 734130728
	b.ScheduleDailyMenu(myChatId, message, "8:00")

	go b.HandleMessages(message)

	return nil
}
