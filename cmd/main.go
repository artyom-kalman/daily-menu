package main

import (
	"log"
	"net/http"

	"github.com/artyom-kalman/kbu-daily-menu/internal/api/handler"
)

const API_ROUTE = "/api"

func main() {
	fs := http.FileServer(http.Dir("./public/"))
	http.Handle("/public/", http.StripPrefix("/public/", fs))

	http.HandleFunc("/", handler.GetIndex)

	http.HandleFunc(API_ROUTE+"/peony", handler.GetPeonyHandler)
	http.HandleFunc(API_ROUTE+"/azilea", handler.GetAzileaHandler)

	log.Print("Server is running on localhost:8000")
	if err := http.ListenAndServe("localhost:8000", nil); err != nil {
		log.Fatal(err)
	}

}
