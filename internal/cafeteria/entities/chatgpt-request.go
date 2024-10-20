package entities

type GPTRequest struct {
	Model    string     `json:"model"`
	Messages []*Message `json:"messages"`
}
