# 🔐 AegisVault

AegisVault is a **terminal-based secure file vault** built in **C++17**. It provides a password-protected environment for securely storing, encrypting, extracting, and managing files through a clean, modular, object-oriented architecture.

Designed as a systems programming and cybersecurity portfolio project, AegisVault demonstrates secure file management, filesystem operations, authentication, password hashing, and encryption while following modular software engineering principles.

---

## 📷 Application Preview

> *Screenshots will be added in future updates.*

---

## ✨ Features

- 🔑 Master password authentication
- 🛡️ Password strength validation
- 🔒 Master password hashing
- 📁 Automatic vault initialization
- 🔐 Password-based file encryption
- 🔓 Secure file decryption and extraction
- 🎲 Randomized encrypted filenames
- 📝 Metadata management
- 📂 Secure encrypted file storage
- 🗑️ Delete individual vault files
- 💥 Password-protected vault destruction
- 📌 Automatic path sanitization
- 🧩 Modular object-oriented architecture

---

## 🛠️ Technologies Used

- C++17
- Standard Template Library (STL)
- `std::filesystem`
- File Streams (`ifstream` / `ofstream`)
- Object-Oriented Programming (OOP)
- Visual Studio 2022

---

## 💻 Platform

- Windows
- Terminal / Command-Line Interface (CLI)
- Visual Studio 2022
- C++17

---

## 📂 Project Structure

```text
AegisVault/
│
├── main.cpp
├── Menu.cpp
├── Menu.h
├── Security.cpp
├── Security.h
├── FileManager.cpp
├── FileManager.h
├── Encryption.cpp
├── Encryption.h
├── Metadata.cpp
├── Metadata.h
│
├── Vault/
│   ├── Files/
│   ├── metadata.txt
│   └── vault.cfg
│
└── README.md
```

---

## ⚙️ How It Works

1. Launch AegisVault.
2. Create a master password on first launch.
3. Authenticate using the master password.
4. Add files to the vault.
5. Files are encrypted and stored with randomized filenames.
6. Metadata maps the original filename to its encrypted file.
7. Extract files using the correct password.
8. Delete individual files or securely destroy the entire vault.

---

## 🚀 Getting Started

### Clone the Repository

```bash
git clone https://github.com/Xat01/AegisVault.git
```

### Build

1. Open the solution in **Visual Studio 2022**.
2. Select the **Release** configuration.
3. Build the solution (`Ctrl + Shift + B`).

### Run

Execute the generated executable or run directly from Visual Studio.

---

## 📦 Building the Executable

1. Open the project in **Visual Studio 2022**.
2. Select:

```text
Configuration : Release
Platform      : x64
```

3. Build the solution.

The executable will be generated inside:

```text
x64/Release/
```

Example:

```text
AegisVault.exe
```

---

## 📌 Current Capabilities (Version 4)

- ✅ Secure vault initialization
- ✅ Master password authentication
- ✅ Password hashing
- ✅ Password strength validation
- ✅ Add files to encrypted vault
- ✅ Extract and decrypt files
- ✅ Randomized encrypted filenames
- ✅ Metadata management
- ✅ Individual file deletion
- ✅ Password-protected vault destruction
- ✅ Automatic path sanitization
- ✅ Modular C++ architecture

---

## 🗺️ Future Roadmap

### Version 5

- Improved encryption algorithm
- Vault integrity verification
- Wrong-password detection
- Hidden password input
- Activity logging
- Automatic vault health checks

### Version 6

- File search
- File rename
- Improved CLI interface
- Utility classes
- Codebase refactoring
- Cross-platform support
- Cloud synchronization research

---

## 📚 Learning Outcomes

This project strengthened practical understanding of:

- Object-Oriented Programming
- Modular Software Design
- File I/O
- Filesystem Management
- Authentication Systems
- Password Hashing
- Basic Cryptography Concepts
- Secure File Storage
- Git & GitHub Workflow
- Defensive Programming

---

## 📄 License

This project is released for **educational and portfolio purposes**.

---

## 👨‍💻 Author

**SRI**

Computer Science (Cybersecurity) Student

University of Wollongong in Dubai

GitHub: https://github.com/Xat01
