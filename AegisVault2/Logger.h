#pragma once

#include <string>

class Logger
{
public:

    void log(const std::string& action,
        const std::string& filename);
};