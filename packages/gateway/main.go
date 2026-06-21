package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

var (
	jwtSecret       = []byte("openhands-secret-key-1234567890")
	deepseekAPIKey  = os.Getenv("DEEPSEEK_API_KEY")
	deepseekAPIBase = os.Getenv("DEEPSEEK_API_BASE") // e.g. https://api.deepseek.com/v1
	qdrantURL       = os.Getenv("QDRANT_URL")       // e.g. http://qdrant:6333
)

func init() {
	if deepseekAPIBase == "" {
		deepseekAPIBase = "https://api.deepseek.com/v1"
	}
	if qdrantURL == "" {
		qdrantURL = "http://qdrant:6333"
	}
	// Verify DeepSeek Key
	if deepseekAPIKey == "" {
		log.Println("⚠️  Warning: DEEPSEEK_API_KEY is not set. Outbound proxy calls will fail.")
	}
}

// Credentials binding
type LoginRequest struct {
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
}

type MemorySyncRequest struct {
	Prompt     string `json:"prompt"`
	GitDiff    string `json:"git_diff"`
	ErrorLog   string `json:"error_log"`
	HealCount  int    `json:"heal_count"`
	ProjectID  string `json:"project_id"`
}

func main() {
	r := gin.Default()

	// CORS Middleware
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// Setup database collection in background
	go setupQdrantCollection()

	// Public Routes
	r.POST("/login", handleLogin)

	// Protected Routes (LLM Proxy & Memory)
	v1 := r.Group("/v1")
	v1.Use(authMiddleware())
	{
		v1.POST("/chat/completions", handleChatCompletionsProxy)
	}

	api := r.Group("/api")
	api.Use(authMiddleware())
	{
		api.POST("/memory/search", handleMemorySearch)
		api.POST("/memory/sync", handleMemorySync)
		api.GET("/health", func(c *gin.Context) {
			c.JSON(200, gin.H{"status": "healthy", "user_id": c.GetString("user_id")})
		})
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("🚀 OpenHands Gateway starting on port %s...", port)
	r.Run(":" + port)
}

func handleLogin(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	// Mock Client Credentials verification
	// In production, verify against database or identity provider
	if req.ClientID != "openhands" || req.ClientSecret != "secret123" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid client credentials"})
		return
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": "user-developer-1",
		"role": "developer",
		"exp":  time.Now().Add(5 * time.Minute).Unix(),
	})

	tokenString, err := token.SignedString(jwtSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to sign token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"access_token": tokenString,
		"token_type":   "Bearer",
		"expires_in":   300,
	})
}

func authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			c.Abort()
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header must be Bearer <token>"})
			c.Abort()
			return
		}

		tokenString := parts[1]
		token, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			return jwtSecret, nil
		})

		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
			c.Abort()
			return
		}

		if claims, ok := token.Claims.(jwt.MapClaims); ok {
			c.Set("user_id", claims["sub"])
			c.Set("role", claims["role"])
		}

		c.Next()
	}
}

// Proxies OpenAI-compatible request stream to DeepSeek
func handleChatCompletionsProxy(c *gin.Context) {
	if deepseekAPIKey == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server LLM API key not configured"})
		return
	}

	bodyBytes, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to read request body"})
		return
	}

	// Forward request to DeepSeek
	reqURL := fmt.Sprintf("%s/chat/completions", deepseekAPIBase)
	proxyReq, err := http.NewRequestWithContext(c.Request.Context(), "POST", reqURL, bytes.NewBuffer(bodyBytes))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create proxy request"})
		return
	}

	// Copy headers
	proxyReq.Header.Set("Content-Type", "application/json")
	proxyReq.Header.Set("Authorization", "Bearer "+deepseekAPIKey)

	client := &http.Client{}
	resp, err := client.Do(proxyReq)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to connect to LLM server: " + err.Error()})
		return
	}
	defer resp.Body.Close()

	// Copy response headers and status
	for k, vv := range resp.Header {
		for _, v := range vv {
			c.Writer.Header().Add(k, v)
		}
	}
	c.Writer.WriteHeader(resp.StatusCode)

	// Stream proxy response body chunk by chunk
	io.Copy(c.Writer, resp.Body)
}

// Memory Search handler
func handleMemorySearch(c *gin.Context) {
	var req struct {
		Prompt string `json:"prompt"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	if req.Prompt == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Prompt cannot be empty"})
		return
	}

	// 1. Generate prompt embedding
	vector, err := generateEmbedding(c.Request.Context(), req.Prompt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to embed prompt: " + err.Error()})
		return
	}

	// 2. Query Qdrant
	qdrantSearchURL := fmt.Sprintf("%s/collections/memory/points/search", qdrantURL)
	searchBody := map[string]interface{}{
		"vector":      vector,
		"limit":       3,
		"with_payload": true,
	}

	searchBytes, _ := json.Marshal(searchBody)
	qdrantReq, err := http.NewRequestWithContext(c.Request.Context(), "POST", qdrantSearchURL, bytes.NewBuffer(searchBytes))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to build Qdrant query"})
		return
	}
	qdrantReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(qdrantReq)
	if err != nil {
		// Fallback if Qdrant is offline
		log.Println("⚠️  Qdrant connection failed, returning empty memories")
		c.JSON(http.StatusOK, gin.H{"memories": []interface{}{}})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		c.JSON(http.StatusBadGateway, gin.H{"error": "Qdrant search error", "details": string(body)})
		return
	}

	var qdrantResult struct {
		Result []struct {
			Score   float64 `json:"score"`
			Payload struct {
				Prompt    string `json:"prompt"`
				GitDiff   string `json:"git_diff"`
				ErrorLog  string `json:"error_log"`
				ProjectID string `json:"project_id"`
			} `json:"payload"`
		} `json:"result"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&qdrantResult); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse Qdrant response"})
		return
	}

	// Format results
	memories := make([]map[string]interface{}, 0)
	for _, item := range qdrantResult.Result {
		// Score threshold filter (e.g. similarity score >= 0.70)
		if item.Score >= 0.70 {
			memories = append(memories, map[string]interface{}{
				"prompt":     item.Payload.Prompt,
				"git_diff":   item.Payload.GitDiff,
				"error_log":  item.Payload.ErrorLog,
				"project_id": item.Payload.ProjectID,
				"score":      item.Score,
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{"memories": memories})
}

// Memory Synchronization handler
func handleMemorySync(c *gin.Context) {
	var req MemorySyncRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	if req.Prompt == "" || req.GitDiff == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Prompt and GitDiff are required"})
		return
	}

	// 1. Generate prompt embedding
	vector, err := generateEmbedding(c.Request.Context(), req.Prompt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to embed prompt: " + err.Error()})
		return
	}

	// 2. Insert point into Qdrant
	qdrantUpsertURL := fmt.Sprintf("%s/collections/memory/points?wait=true", qdrantURL)
	pointID := uuid.New().String()
	upsertBody := map[string]interface{}{
		"points": []map[string]interface{}{
			{
				"id":     pointID,
				"vector": vector,
				"payload": map[string]interface{}{
					"prompt":     req.Prompt,
					"git_diff":   req.GitDiff,
					"error_log":  req.ErrorLog,
					"heal_count": req.HealCount,
					"project_id": req.ProjectID,
					"created_at": time.Now().Format(time.RFC3339),
				},
			},
		},
	}

	upsertBytes, _ := json.Marshal(upsertBody)
	qdrantReq, err := http.NewRequestWithContext(c.Request.Context(), "PUT", qdrantUpsertURL, bytes.NewBuffer(upsertBytes))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to build Qdrant upsert request"})
		return
	}
	qdrantReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(qdrantReq)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to connect to Qdrant: " + err.Error()})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		c.JSON(http.StatusBadGateway, gin.H{"error": "Qdrant upsert error", "details": string(body)})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "synced", "point_id": pointID})
}

// Helper to generate embedding using DeepSeek/OpenAI Embedding endpoint
func generateEmbedding(ctx context.Context, text string) ([]float32, error) {
	if deepseekAPIKey == "" {
		return nil, fmt.Errorf("deepseek API key not configured")
	}

	// We use DeepSeek or fallback standard OpenAI embedding model via proxy
	// Note: DeepSeek doesn't have an embedding API currently, so we call standard OpenAI endpoint
	// or use a configured embedding API endpoint in production.
	// For fallback, we return a mock vector if the call fails.
	embeddingURL := "https://api.openai.com/v1/embeddings"
	if strings.Contains(deepseekAPIBase, "deepseek") {
		// Fallback to mock embedding vectors of size 1536 since DeepSeek doesn't offer embedding
		// In a production corporate setup, you would hook this to OpenAI, Cohere or an internal model.
		log.Println("ℹ️  Using mock embedding vector generator for DeepSeek")
		mockVector := make([]float32, 1536)
		// Generate deterministically based on text length for simple mock
		for i := 0; i < len(mockVector); i++ {
			mockVector[i] = float32(len(text)) / float32(i+1)
		}
		return mockVector, nil
	}

	reqBody := map[string]interface{}{
		"input": text,
		"model": "text-embedding-3-small",
	}
	bodyBytes, _ := json.Marshal(reqBody)

	req, err := http.NewRequestWithContext(ctx, "POST", embeddingURL, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+deepseekAPIKey)

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("embedding server returned status %d", resp.StatusCode)
	}

	var result struct {
		Data []struct {
			Embedding []float32 `json:"embedding"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	if len(result.Data) == 0 {
		return nil, fmt.Errorf("empty embedding response")
	}

	return result.Data[0].Embedding, nil
}

// Helper to auto-create Qdrant memory collection on startup
func setupQdrantCollection() {
	time.Sleep(3 * time.Second) // wait for qdrant boot
	url := fmt.Sprintf("%s/collections/memory", qdrantURL)

	// Check if collection exists
	resp, err := http.Get(url)
	if err == nil && resp.StatusCode == http.StatusOK {
		log.Println("✅ Qdrant 'memory' collection already exists")
		resp.Body.Close()
		return
	}
	if resp != nil {
		resp.Body.Close()
	}

	// Create collection (1536 dimensions, Cosine metric)
	body := map[string]interface{}{
		"vectors": map[string]interface{}{
			"size":     1536,
			"distance": "Cosine",
		},
	}
	bodyBytes, _ := json.Marshal(body)

	req, err := http.NewRequest("PUT", url, bytes.NewBuffer(bodyBytes))
	if err != nil {
		log.Println("❌ Failed to create Qdrant collection request:", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err = client.Do(req)
	if err != nil {
		log.Println("⚠️  Failed to connect to Qdrant during collection setup (Qdrant may be offline)")
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		log.Println("✅ Qdrant 'memory' collection created successfully")
	} else {
		resBytes, _ := io.ReadAll(resp.Body)
		log.Println("❌ Qdrant collection setup returned:", resp.Status, string(resBytes))
	}
}
