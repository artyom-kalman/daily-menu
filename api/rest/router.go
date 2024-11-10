package rest

import (
	"net/http"

	"github.com/artyom-kalman/kbu-daily-menu/internal/application/rest"
)

func SetupRouts() {
	fs := http.FileServer(http.Dir("./public/"))
	http.Handle("/public/", http.StripPrefix("/public/", fs))

	http.HandleFunc("/", rest.GetIndex)
}
