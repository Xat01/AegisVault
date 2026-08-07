#pragma once
#include <string>
class Security {
public:
	bool login();
	bool isVaultInitialized();
	void destroyVault();
	bool verifyVaultStructure();
	bool verifyPassword();
	void emergencyRecovery();
	
private:
	
	void initializeVault();
	void createPassword();
	bool isStrongPassword(const std::string& password);
	std::string hashPassword(const std::string& password);
	std::string getHiddenPassword();
	const std::string vaultPath = "Vault";
	const std::string configPath = "Vault/vault.cfg";
	const std::string filesPath = "Vault/Files";
	
};