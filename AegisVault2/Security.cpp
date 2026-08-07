#include "Security.h"
#include <fstream>
#include <iostream>
#include <filesystem>
#include <sstream>
#include <string>
#include <iomanip>
#include <conio.h>
#include "Metadata.h"
#include <openssl/sha.h>
namespace fs = std::filesystem;
using namespace std;

bool Security::isVaultInitialized() {

	return fs::exists(vaultPath);
	return fs::exists(configPath);
}
	

void Security::initializeVault() {
	bool createVault = fs::create_directory(vaultPath);
	Metadata metadata;


	if (createVault) {
		cout << "Vault created successfully.\n";
	}
	else {
		cout << "Vault already exists\n";
	}

	bool createFiles = fs::create_directory(filesPath);

	if (createFiles) {
		cout << "Files folder created successfully.\n";
	}
	else {
		cout << "Files folder already exists\n";
	}

	string fullVault = vaultPath + "/metadata.dat";
	ofstream metadataFile(fullVault);
	metadataFile.close();
	Security::createPassword();
}

void Security::createPassword() {
	string userPassword;
	string confirmPassword;

	while (true) {
		cout << "Create a master password: ";
		userPassword = Security::getHiddenPassword();
		cout << endl;

		if (!isStrongPassword(userPassword)) {
			cout << "\nPassword needs at least:\n";
			cout << "- 8 characters\n";
			cout << "- One uppercase letter\n";
			cout << "- One lowercase letter\n";
			cout << "- One digit\n";
			cout << "- One special character\n\n";
			continue;
		}

		cout << "Confirm password: ";
		confirmPassword = Security::getHiddenPassword();
		cout << endl;

		if (userPassword != confirmPassword) {
			cout << "Passwords do not match. Try again.\n\n";
			continue;
		}

		string hashPass = Security::hashPassword(userPassword);
		


		string configPath = vaultPath + "/vault.cfg";

		ofstream configFile(configPath);

		if (!configFile) {
			cout << "Error creating vault configuration file.\n";
			return;
		}

		configFile << hashPass;
		configFile.close();

		cout << "Master password created successfully!\n";
		break;
	}

}


bool Security::isStrongPassword(const string& userPassword) {
	bool hasUpper = false;
	bool hasLower = false;
	bool hasDigit = false;
	bool hasSpecial = false;

	if (userPassword.length() < 8 ){
		return false;
	}

	for (char ch : userPassword) {
		if (isupper(ch)) {
			hasUpper = true;
		}
		else if (islower(ch)) {
			hasLower = true;
		}
		else if (isdigit(ch)) {
			hasDigit = true;
		}
		else {
			hasSpecial = true;
		}
	}

	return hasUpper && hasLower && hasDigit && hasSpecial;
}

bool Security::verifyPassword() {
	string savedPassword;
	string enteredPassword;

	string configPath = vaultPath + "/vault.cfg";

	ifstream configFile(configPath);

	if (!configFile) {
		cout << "Unable to open vault configuration. \n";
		return false;
	}

	getline(configFile, savedPassword);
	configFile.close();
	cout << "Enter master Password: ";
	enteredPassword = Security::getHiddenPassword();
	cout << endl;

	string verHashPass = Security::hashPassword(enteredPassword);

	if (verHashPass == savedPassword) {
		cout << "Accessgranted.\n";
		return true;
	}
	else {
		cout << "Incorrect password! \n";
		return false;
	}
}


bool Security::login() {
	Metadata metadata;

	if (!isVaultInitialized()) {
		initializeVault();
		return true;
	}
	if (!verifyVaultStructure()) {
		emergencyRecovery();
		return false;
	}
	if (!verifyPassword()) {
		return false;
	}
	if (!metadata.verifyMetadataIntegrity()) {
		cout << "Integrity verification failed!\n";
		return false;
	}
	return true;
}

string Security::hashPassword(const string& password) {

	unsigned char hash[SHA256_DIGEST_LENGTH];
	SHA256(reinterpret_cast<const unsigned char*>(password.c_str()),
		password.size(),
		hash);

	ostringstream ss;

	for (unsigned char byte : hash) {

		ss << hex;
		ss << setw(2) << setfill('0');
		ss << static_cast<int>(byte);
	}
	return ss.str();

}

void Security::destroyVault() {
	if (!fs::exists(vaultPath)) {
		cout << "Cannot destroy Vault does not exists\n";
		return;
	}

	if (!verifyPassword()) {
		cout << "Access denied\n";
		return;
	}
	string delPhrase;
	cout << "------ WARNING ------\n";
	cout << "ABOUT TO DELETE THE VAULT AND ITS FOLDERS\n";
	cout << "Enter DELETE or D to delete! : ";
	cin >> delPhrase;

	if (delPhrase == "DELETE" || delPhrase == "D") {
		fs::remove_all(vaultPath);
		cout << "Vault destroyed successfully.\n";
		return;
	}

}

bool Security::verifyVaultStructure() {
	if (!fs::exists(vaultPath)) {
		fs::create_directory(vaultPath);
		return true;
	}

	if (!fs::exists(filesPath)) {
		fs::create_directory(filesPath);
		return true;
	}
	if (!fs::exists(vaultPath + "/metadata.dat")) {
		ofstream metadata(vaultPath + "/metadata.dat");
		metadata.close();
	}
	if (!fs::exists(configPath)) {
		return false;
	}
	return true;
	
}

void Security::emergencyRecovery() {
	int choice;
	if (!fs::exists(configPath)) {
		cout << "==============================\n";
		cout << endl;
		cout << endl;
		cout << "     EMERGENCY RECOVERY        \n";
		cout << endl;
		cout << endl;
		cout << "==============================\n";

		cout << "1. Exit \n";
		cout << "2. Destroy Vault\n";
		cout << "Enter Your choice: ";
		cin >> choice;

		switch (choice) {
		case 1:
			cout << "Exiting vault....." << endl;
			break;

		case 2:
			fs::remove_all(vaultPath);
			cout << "Vault destroyed successfully.\n";
			return;

		default:
			cout << "Invalid choice.\n";
			return;
		}
	}
	else {
		cout << "Config File already Exists!\n";
		return;
	}
}

string Security::getHiddenPassword() {
	string password;
	char ch;

	while (true) {
		ch = _getch();

		if (ch == '\r') {
			break;
		}
		else if (ch == '\b') {
			if (password.empty()) {
				continue;
			}
			password.pop_back();
			cout << '\b' << ' ' << '\b';
			continue;
		}
		password += ch;
		cout << "*";
	}
	return password;
}