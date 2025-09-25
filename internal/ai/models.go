package ai

type Request struct {
	Messages []*Message `json:"messages"`
}

type Response struct {
	Result struct {
		Response string `json:"response"`
	} `json:"result"`
	Success bool     `json:"success"`
	Errors  []string `json:"errors"`
}

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}
