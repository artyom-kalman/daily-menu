package cafeteria

type GPTRequest struct {
	Model   string   `json:"model"`
	Message *Message `json:"message"`
}
