import { Command, CommanderError, InvalidArgumentError } from "commander"

export type DoctorMode = "fast" | "deep"

export type OttoCommand =
  | {
      name: "setup"
    }
  | {
      name: "serve"
    }
  | {
      name: "telegram-worker"
    }
  | {
      name: "doctor"
      mode: DoctorMode
    }

type BaseOttoCommand = "setup" | "serve" | "telegram-worker" | "doctor"

const VALID_COMMANDS = ["setup", "serve", "telegram-worker", "doctor"] as const

/**
 * Centralizes command validation in one parser so runtime entry behavior stays predictable
 * as Otto grows additional subcommands.
 *
 * @param argv Raw user arguments from process argv.
 * @returns Supported Otto command, defaulting to `serve` for zero-arg startup.
 */
export const parseCommand = (argv: string[]): OttoCommand => {
  const parser = new Command()

  parser
    .exitOverride()
    .allowUnknownOption(false)
    .allowExcessArguments(false)
    .argument(
      "[command]",
      "runtime command",
      (value: string) => {
        if (!VALID_COMMANDS.includes(value as BaseOttoCommand)) {
          throw new InvalidArgumentError(
            `Unknown command: ${value}. Valid commands: ${VALID_COMMANDS.join(", ")}`
          )
        }

        return value
      },
      "serve"
    )
    .option("--deep", "Run doctor in deep mode")

  try {
    parser.parse(argv, { from: "user" })
  } catch (error) {
    if (error instanceof CommanderError) {
      throw new Error(error.message)
    }

    if (error instanceof Error) {
      throw error
    }

    throw new Error("Unknown command parsing error")
  }

  const baseCommand = parser.processedArgs[0] as BaseOttoCommand
  const options = parser.opts<{ deep?: boolean }>()
  const isDeepMode = options.deep === true

  if (baseCommand !== "doctor" && isDeepMode) {
    throw new Error("Unknown option '--deep'. Usage: otto doctor [--deep]")
  }

  if (baseCommand === "doctor") {
    return {
      name: "doctor",
      mode: isDeepMode ? "deep" : "fast",
    }
  }

  return {
    name: baseCommand,
  }
}
