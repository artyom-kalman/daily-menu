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
			if err := b.sendMenuWithButtons(chatID, message); err != nil {
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

func (b *Bot) sendStartMessage(chatID int64) error {
	msg := tgbotapi.NewMessage(chatID, "🍽️ Добро пожаловать в бот ежедневного меню нашего универа!\n\nПолучайте обновления меню каждый день в 10:00.\nНажмите кнопку ниже, чтобы подписаться:")

	keyboard := tgbotapi.NewInlineKeyboardMarkup(
		tgbotapi.NewInlineKeyboardRow(
			tgbotapi.NewInlineKeyboardButtonData("🔔 Подписаться", "subscribe"),
		),
	)

	msg.ReplyMarkup = keyboard
	_, err := b.bot.Send(msg)
	return err
}

func (b *Bot) sendSubscriptionConfirmation(chatID int64) error {
	msg := tgbotapi.NewMessage(chatID, "✅ Вы подписаны на ежедневные обновления меню в 10:00!\n\nВы будете получать меню каждый день в 10:00.")

	keyboard := tgbotapi.NewInlineKeyboardMarkup(
		tgbotapi.NewInlineKeyboardRow(
			tgbotapi.NewInlineKeyboardButtonData("❌ Отписаться", "unsubscribe_confirm"),
		),
	)

	msg.ReplyMarkup = keyboard
	_, err := b.bot.Send(msg)
	return err
}

func (b *Bot) sendMenuWithButtons(chatID int64, menuText string) error {
	msg := tgbotapi.NewMessage(chatID, menuText)

	keyboard := tgbotapi.NewInlineKeyboardMarkup(
		tgbotapi.NewInlineKeyboardRow(
			tgbotapi.NewInlineKeyboardButtonData("❌ Отписаться", "unsubscribe_confirm"),
		),
	)

	msg.ReplyMarkup = keyboard
	_, err := b.bot.Send(msg)
	return err
}

func (b *Bot) sendUnsubscribeConfirmation(chatID int64) error {
	msg := tgbotapi.NewMessage(chatID, "Вы уверены, что хотите отписаться от ежедневных обновлений меню?")

	keyboard := tgbotapi.NewInlineKeyboardMarkup(
		tgbotapi.NewInlineKeyboardRow(
			tgbotapi.NewInlineKeyboardButtonData("Да, отписаться", "unsubscribe_yes"),
			tgbotapi.NewInlineKeyboardButtonData("Отмена", "unsubscribe_cancel"),
		),
	)

	msg.ReplyMarkup = keyboard
	_, err := b.bot.Send(msg)
	return err
}

func (b *Bot) handleCallbackQuery(callback *tgbotapi.CallbackQuery) error {
	chatID := callback.Message.Chat.ID
	action := callback.Data

	switch action {
	case "subscribe":
		if err := b.subscribeChat(chatID); err != nil {
			return b.SendMessage(int(chatID), "Failed to subscribe. Please try again later.")
		}
		return b.sendSubscriptionConfirmation(chatID)

	case "unsubscribe_confirm":
		return b.sendUnsubscribeConfirmation(chatID)

	case "unsubscribe_yes":
		if err := b.unsubscribeChat(chatID); err != nil {
			return b.SendMessage(int(chatID), "Не удалось отписаться. Попробуйте позже.")
		}
		msg := tgbotapi.NewMessage(chatID, "❌ Вы отписались от ежедневных обновлений меню.\n\nИспользуйте /start чтобы подписаться снова.")
		keyboard := tgbotapi.NewInlineKeyboardMarkup(
			tgbotapi.NewInlineKeyboardRow(
				tgbotapi.NewInlineKeyboardButtonData("🔔 Подписаться снова", "subscribe"),
			),
		)
		msg.ReplyMarkup = keyboard
		_, err := b.bot.Send(msg)
		return err

	case "unsubscribe_cancel":
		msg := tgbotapi.NewMessage(chatID, "❌ Отписка отменена.\nВы продолжите получать ежедневные обновления меню.")
		keyboard := tgbotapi.NewInlineKeyboardMarkup(
			tgbotapi.NewInlineKeyboardRow(
				tgbotapi.NewInlineKeyboardButtonData("❌ Отписаться", "unsubscribe_confirm"),
			),
		)
		msg.ReplyMarkup = keyboard
		_, err := b.bot.Send(msg)
		return err

	default:
		return b.SendMessage(int(chatID), "Неизвестное действие. Попробуйте еще раз.")
	}
}

func (b *Bot) handleCommand(update tgbotapi.Update, defaultMessage string) error {
	chatID := update.Message.Chat.ID
	command := update.Message.Command()

	switch command {
	case "start":
		return b.sendStartMessage(chatID)

	case "subscribe":
		if err := b.subscribeChat(chatID); err != nil {
			return b.SendMessage(int(chatID), "Не удалось подписаться. Попробуйте позже.")
		}
		return b.sendSubscriptionConfirmation(chatID)

	case "unsubscribe":
		if err := b.unsubscribeChat(chatID); err != nil {
			return b.SendMessage(int(chatID), "Не удалось отписаться. Попробуйте позже.")
		}
		return b.SendMessage(int(chatID), "❌ Вы отписались от ежедневных обновлений меню.")

	case "status":
		isActive, err := b.getSubscriptionStatus(chatID)
		if err != nil {
			return b.SendMessage(int(chatID), "Не удалось проверить статус подписки. Попробуйте позже.")
		}

		status := "❌ Не подписан"
		if isActive {
			status = "✅ Подписан"
		}
		return b.SendMessage(int(chatID), fmt.Sprintf("Статус подписки: %s\nЕжедневные обновления меню в 10:00", status))

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
		if update.Message != nil {
			if update.Message.IsCommand() {
				if err := b.handleCommand(update, text); err != nil {
					logger.ErrorErr("Failed to handle command", err)
				}
			} else {
				if err := b.sendMenuWithButtons(update.Message.Chat.ID, text); err != nil {
					return err
				}
			}
		} else if update.CallbackQuery != nil {
			if err := b.handleCallbackQuery(update.CallbackQuery); err != nil {
				logger.ErrorErr("Failed to handle callback query", err)
			}

			callbackCfg := tgbotapi.NewCallback(update.CallbackQuery.ID, "")
			if _, err := b.bot.Request(callbackCfg); err != nil {
				logger.ErrorErr("Failed to answer callback query", err)
			}
		}
	}
	return nil
}

func FormatMenuMessage(peony, azilea *menu.Menu) string {
	var message strings.Builder
	message.WriteString("🍽️ Меню на сегодня.\n\n")

	message.WriteString("🌸 Peony (нижняя столовая):\n")
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

	message.WriteString("\n🌺 Azilea (верхняя столовая):\n")
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
