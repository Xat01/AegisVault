#pragma once
#include <string>
class Security {
public:
	bool login();
	bool isVaultInitialized();
	
private:
	
	void initializeVault();
	void createPassword();
	bool verifyPassword();
	bool isStrongPassword(const std::string& password);
	std::string hashPassword(const std::string& password);
	const std::string vaultPath = "Vault";
	const std::string configPath = "Vault/vault.cfg";
	const std::string filesPath = "Vault/Files";
	
};