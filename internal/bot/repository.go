package bot

import (
	"database/sql"

	"github.com/artyom-kalman/kbu-daily-menu/internal/database"
)

type SubscriptionRepository struct {
	db *database.Database
}

func NewSubscriptionRepository(db *database.Database) *SubscriptionRepository {
	return &SubscriptionRepository{
		db: db,
	}
}

func (r *SubscriptionRepository) LoadSubscribers() ([]int64, error) {
	rows, err := r.db.Conn.Query("SELECT chat_id FROM bot_subscriptions WHERE is_active = true")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var subscribers []int64
	for rows.Next() {
		var chatID int64
		if err := rows.Scan(&chatID); err != nil {
			return nil, err
		}
		subscribers = append(subscribers, chatID)
	}

	return subscribers, nil
}

func (r *SubscriptionRepository) Subscribe(chatID int64) error {
	_, err := r.db.Conn.Exec(`
		INSERT OR REPLACE INTO bot_subscriptions (chat_id, is_active, updated_at) 
		VALUES (?, true, CURRENT_TIMESTAMP)
	`, chatID)
	return err
}

func (r *SubscriptionRepository) Unsubscribe(chatID int64) error {
	_, err := r.db.Conn.Exec(`
		UPDATE bot_subscriptions 
		SET is_active = false, updated_at = CURRENT_TIMESTAMP 
		WHERE chat_id = ?
	`, chatID)
	return err
}

func (r *SubscriptionRepository) GetStatus(chatID int64) (bool, error) {
	var isActive bool
	err := r.db.Conn.QueryRow(`
		SELECT is_active FROM bot_subscriptions 
		WHERE chat_id = ?
	`, chatID).Scan(&isActive)

	if err == sql.ErrNoRows {
		return false, nil
	}
	return isActive, err
}
