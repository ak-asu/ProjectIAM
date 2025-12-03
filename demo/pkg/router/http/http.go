package http

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/iden3/go-service-template/pkg/router/http/handlers"
	"github.com/iden3/go-service-template/pkg/router/http/middleware"
)

type Handlers struct {
	systemHandler         handlers.SystemHandler
	authenticationHandler handlers.AuthenticationHandlers
	iden3commHandler      handlers.Iden3commHandlers
	issuerHandler         handlers.IssuerHandlers
	verificationHandler   handlers.VerificationHandlers
}

func NewHandlers(
	systemHandler handlers.SystemHandler,
	authHendler handlers.AuthenticationHandlers,
	iden3commHandler handlers.Iden3commHandlers,
	issuerHandler handlers.IssuerHandlers,
	verificationHandler handlers.VerificationHandlers,
) Handlers {
	return Handlers{
		systemHandler:         systemHandler,
		authenticationHandler: authHendler,
		iden3commHandler:      iden3commHandler,
		issuerHandler:         issuerHandler,
		verificationHandler:   verificationHandler,
	}
}

func (h *Handlers) NewRouter(opts ...Option) http.Handler {
	r := chi.NewRouter()

	for _, opt := range opts {
		opt(r)
	}

	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(middleware.RequestLog)
	r.Use(chimiddleware.Recoverer)

	h.basicRouters(r)
	h.authRouters(r)
	h.agentRouters(r)
	h.apiRouters(r)
	h.schemaRouters(r)
	h.verificationRouters(r)

	return r
}

func (h Handlers) basicRouters(r *chi.Mux) {
	r.Get("/readiness", h.systemHandler.Readiness)
	r.Get("/liveness", h.systemHandler.Liveness)
}

func (h Handlers) authRouters(r *chi.Mux) {
	r.Get("/api/v1/requests/auth", h.authenticationHandler.CreateAuthenticationRequest)
	r.Post("/api/v1/callback", h.authenticationHandler.Callback)
	r.Get("/api/v1/status", h.authenticationHandler.AuthenticationRequestStatus)
}

func (h Handlers) agentRouters(r *chi.Mux) {
	r.Post("/api/v1/agent", h.iden3commHandler.Agent)
}

func (h Handlers) apiRouters(r *chi.Mux) {
	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/issuers", h.issuerHandler.GetIssuersList)
		r.Route("/identities/{identifier}", func(r chi.Router) {
			r.Use(middleware.ParseDID)

			r.Post("/claims", h.issuerHandler.CreateClaim)
			r.Get("/claims", h.issuerHandler.GetUserVCs)
			r.Get("/claims/{claimId}", h.issuerHandler.GetUserVCByID)
			r.Get("/claims/revocation/status/{nonce}", h.issuerHandler.IsRevokedClaim)
			r.Get("/claims/offer", h.issuerHandler.GetOffer)
			r.Post("/claims/revoke/{nonce}", h.issuerHandler.RevokeClaim)
		})
	})
}

func (h Handlers) schemaRouters(r *chi.Mux) {
	// Serve schema files from /schemas directory with correct Content-Type headers
	fileServer := http.FileServer(http.Dir("./schemas"))
	r.Handle("/schemas/*", http.StripPrefix("/schemas", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Set correct Content-Type based on file extension
		if strings.HasSuffix(r.URL.Path, ".jsonld") {
			w.Header().Set("Content-Type", "application/ld+json")
		} else if strings.HasSuffix(r.URL.Path, ".json") {
			w.Header().Set("Content-Type", "application/json")
		} else if strings.HasSuffix(r.URL.Path, ".md") {
			w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
		}
		// Enable CORS for schema files
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		fileServer.ServeHTTP(w, r)
	})))
}

func (h Handlers) verificationRouters(r *chi.Mux) {
	r.Post("/api/v1/verification/request", h.verificationHandler.CreateVerificationRequest)
	r.Post("/api/v1/verification/callback", h.verificationHandler.VerificationCallback)
	r.Get("/api/v1/verification/status", h.verificationHandler.VerificationStatus)
}
