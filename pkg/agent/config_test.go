package agent

import (
	"os"
	"path/filepath"
	"testing"
)

func TestConfigManager_Precedence(t *testing.T) {
	// Create a temporary directory for config
	tmpDir, err := os.MkdirTemp("", "agent-config-test")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	configPath := filepath.Join(tmpDir, "config.yaml")

	// 1. Setup ConfigManager with temp path
	cm := &ConfigManager{
		configPath:  configPath,
		config:      &AgentConfig{Agents: make(map[string]AgentKeyConfig)},
		keyValidity: make(map[string]bool),
	}

	provider := "openai"
	envVar := "OPENAI_API_KEY"

	// Ensure env is clean
	os.Unsetenv(envVar)
	defer os.Unsetenv(envVar)

	// Step A: Initial state (empty)
	if cm.GetAPIKey(provider) != "" {
		t.Error("expected empty API key")
	}

	// Step B: Set In-Memory
	cm.SetAPIKeyInMemory(provider, "memory-key")
	if cm.GetAPIKey(provider) != "memory-key" {
		t.Errorf("expected memory-key, got %s", cm.GetAPIKey(provider))
	}
	if cm.HasAPIKey(provider) {
		t.Error("HasAPIKey should be false for in-memory only keys")
	}

	// Step C: Set in Config (Persistent)
	err = cm.SetAPIKey(provider, "config-key")
	if err != nil {
		t.Fatalf("SetAPIKey failed: %v", err)
	}
	if cm.GetAPIKey(provider) != "config-key" {
		t.Errorf("expected config-key, got %s", cm.GetAPIKey(provider))
	}
	if !cm.HasAPIKey(provider) {
		t.Error("HasAPIKey should be true for persistent keys")
	}

	// Step D: Set Env Var (Highest precedence)
	os.Setenv(envVar, "env-key")
	if cm.GetAPIKey(provider) != "env-key" {
		t.Errorf("expected env-key (env wins over config), got %s", cm.GetAPIKey(provider))
	}
	if !cm.IsFromEnv(provider) {
		t.Error("expected IsFromEnv to be true")
	}

	// Step E: Remove Persistent Key
	err = cm.RemoveAPIKey(provider)
	if err != nil {
		t.Fatalf("RemoveAPIKey failed: %v", err)
	}
	// Env still wins
	if cm.GetAPIKey(provider) != "env-key" {
		t.Errorf("expected env-key, got %s", cm.GetAPIKey(provider))
	}

	os.Unsetenv(envVar)
	// Now it should fallback to in-memory if it was still there, but GetAPIKey implementation
	// might have replaced the map entry. Let's check.
	// Actually SetAPIKey overwrites the entry in cm.config.Agents.
	// SetAPIKeyInMemory also overwrites it.
}

func TestConfigManager_LoadSave(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "agent-config-io-test")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	configPath := filepath.Join(tmpDir, "config.yaml")

	cm1 := &ConfigManager{
		configPath: configPath,
		config:     &AgentConfig{Agents: make(map[string]AgentKeyConfig)},
	}

	// Set some values
	cm1.SetAPIKey("p1", "k1")
	cm1.SetModel("p1", "m1")
	cm1.SetBaseURL("p1", "http://base.com")

	// cm1.Save() is called inside SetAPIKey, SetModel, SetBaseURL.
	// Let's verify file exists.
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		t.Fatal("config file was not created")
	}

	// Create new manager and load
	cm2 := &ConfigManager{
		configPath: configPath,
	}
	err = cm2.Load()
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	if cm2.GetAPIKey("p1") != "k1" {
		t.Errorf("expected k1, got %s", cm2.GetAPIKey("p1"))
	}
	if cm2.GetModel("p1", "default") != "m1" {
		t.Errorf("expected m1, got %s", cm2.GetModel("p1", "default"))
	}
	if cm2.GetBaseURL("p1") != "http://base.com" {
		t.Errorf("expected http://base.com, got %s", cm2.GetBaseURL("p1"))
	}

	// Test removal
	cm2.RemoveBaseURL("p1")
	if cm2.GetBaseURL("p1") != "" {
		t.Error("expected empty base URL after removal")
	}
}

func TestConfigManager_KeyValidity(t *testing.T) {
	cm := &ConfigManager{
		keyValidity: make(map[string]bool),
	}

	provider := "test"
	if cm.IsKeyValid(provider) != nil {
		t.Error("expected nil validity for unknown provider")
	}

	cm.SetKeyValidity(provider, true)
	val := cm.IsKeyValid(provider)
	if val == nil || *val != true {
		t.Error("expected true validity")
	}

	cm.SetKeyValidity(provider, false)
	val = cm.IsKeyValid(provider)
	if val == nil || *val != false {
		t.Error("expected false validity")
	}
}
