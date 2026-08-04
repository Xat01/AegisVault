#pragma once

class FileManager
{
public:
    void addFile();
    void listFile();
    void deleteFile();
    void extractFile();
private:
    const std::string vaultPath = "Vault";
    const std::string filesPath = "Vault/Files";
    std::string cleanPath(const std::string& path);
};