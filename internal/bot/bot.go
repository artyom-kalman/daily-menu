package bot

import (
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/artyom-kalman/kbu-daily-menu/config"
	"github.com/artyom-kalman/kbu-daily-menu/internal/menu"
	"github.com/artyom-kalman/kbu-daily-menu/pkg/logger"
	"github.com/go-co-op/gocron"
	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
)

type Bot struct {
	bot       *tgbotapi.BotAPI
	repo      *SubscriptionRepository
	scheduler *gocron.Scheduler
}

func NewBot(token string, repo *SubscriptionRepository) (*Bot, error) {
	bot, err := tgbotapi.NewBotAPI(token)
	if err != nil {
		return nil, err
	}

	scheduler := gocron.NewScheduler(time.Local)

	return &Bot{
		bot:       bot,
		repo:      repo,
		scheduler: scheduler,
	}, nil
}

func (b *Bot) SendMessage(chatId int, text string) error {
	message := tgbotapi.NewMessage(int64(chatId), text)

	_, err := b.bot.Send(message)

	return err
}

func (b *Bot) loadSubscribers() ([]int64, error) {
	return b.repo.LoadSubscribers()
}

func (b *Bot) scheduleDailyMessages(message string) {
	subscribers, err := b.loadSubscribers()
	if err != nil {
		logger.ErrorErr("Failed to load subscribers", err)
		return
	}

	if len(subscribers) == 0 {
		logger.Info("No active subscribers found")
		return
	}

	b.scheduler.Every(1).Day().At("10:00").Do(func() {
		for _, chatID := range subscribers {
			if err := b.SendMessage(int(chatID), message); err != nil {
				logger.ErrorErrWithFields("Failed to send message to chat", err,
					slog.Int64("chat_id", chatID))
			}
		}
	})

	b.scheduler.StartAsync()
	logger.InfoWithFields("Scheduled daily messages for subscribers",
		slog.Int("subscriber_count", len(subscribers)),
		slog.String("schedule_time", "10:00"))
}

func (b *Bot) subscribeChat(chatID int64) error {
	return b.repo.Subscribe(chatID)
}

func (b *Bot) unsubscribeChat(chatID int64) error {
	return b.repo.Unsubscribe(chatID)
}

func (b *Bot) getSubscriptionStatus(chatID int64) (bool, error) {
	return b.repo.GetStatus(chatID)
}

func (b *Bot) handleCommand(update tgbotapi.Update, defaultMessage string) error {
	chatID := update.Message.Chat.ID
	command := update.Message.Command()

	switch command {
	case "subscribe":
		if err := b.subscribeChat(chatID); err != nil {
			return b.SendMessage(int(chatID), "Failed to subscribe. Please try again later.")
		}
		return b.SendMessage(int(chatID), "✅ You have been subscribed to daily menu updates at 10:00 AM!")

	case "unsubscribe":
		if err := b.unsubscribeChat(chatID); err != nil {
			return b.SendMessage(int(chatID), "Failed to unsubscribe. Please try again later.")
		}
		return b.SendMessage(int(chatID), "❌ You have been unsubscribed from daily menu updates.")

	case "status":
		isActive, err := b.getSubscriptionStatus(chatID)
		if err != nil {
			return b.SendMessage(int(chatID), "Failed to check subscription status. Please try again later.")
		}

		status := "❌ Not subscribed"
		if isActive {
			status = "✅ Subscribed"
		}
		return b.SendMessage(int(chatID), fmt.Sprintf("Subscription status: %s\nDaily menu updates at 10:00 AM", status))

	default:
		msg := tgbotapi.NewMessage(chatID, defaultMessage)
		_, err := b.bot.Send(msg)
		return err
	}
}

func (b *Bot) HandleMessages(text string) error {
	updateConf := tgbotapi.NewUpdate(0)
	updateConf.Timeout = 60

	updates := b.bot.GetUpdatesChan(updateConf)
	for update := range updates {
		if update.Message == nil {
			continue
		}

		if update.Message.IsCommand() {
			if err := b.handleCommand(update, text); err != nil {
				logger.ErrorErr("Failed to handle command", err)
			}
		} else {
			msg := tgbotapi.NewMessage(update.Message.Chat.ID, text)
			_, err := b.bot.Send(msg)
			if err != nil {
				return err
			}
		}
	}
	return nil
}

func FormatMenuMessage(peony, azilea *menu.Menu) string {
	var message strings.Builder
	message.WriteString("Вот меню на сегодня.\n\n")

	message.WriteString("🌸 Peony (нижняя):\n")
	if len(peony.Items) <= 1 {
		message.WriteString("Сегодня выходной\n")
	} else {
		for i, item := range peony.Items {
			message.WriteString(fmt.Sprintf("%d) %s", i+1, item.Name))
			if item.Description != "" && item.Description != "TODO" {
				message.WriteString(fmt.Sprintf(" - %s", item.Description))
			}
			message.WriteString("\n")
		}
	}

	message.WriteString("\n🌺 Azilea (верхняя):\n")
	if len(azilea.Items) <= 1 {
		message.WriteString("Сегодня выходной\n")
	} else {
		for i, item := range azilea.Items {
			message.WriteString(fmt.Sprintf("%d) %s", i+1, item.Name))
			if item.Description != "" && item.Description != "TODO" {
				message.WriteString(fmt.Sprintf(" - %s", item.Description))
			}
			message.WriteString("\n")
		}
	}

	return message.String()
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

	b.scheduleDailyMessages(message)

	go b.HandleMessages(message)

	return nil
}
