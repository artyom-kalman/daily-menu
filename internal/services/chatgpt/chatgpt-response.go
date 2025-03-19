package chatgpt

type Response struct {
	Result struct {
		Response string `json:"response"`
	} `json:"result"`
	Success bool     `json:"success"`
	Errors  []string `json:"errors"`
}
