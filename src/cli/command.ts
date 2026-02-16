import { Command, CommanderError, InvalidArgumentError } from "commander"

export type OttoCommand = "setup" | "serve"

const VALID_COMMANDS = ["setup", "serve"] as const

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
        if (!VALID_COMMANDS.includes(value as OttoCommand)) {
          throw new InvalidArgumentError(
            `Unknown command: ${value}. Valid commands: ${VALID_COMMANDS.join(", ")}`
          )
        }

        return value
      },
      "serve"
    )

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

  return parser.processedArgs[0] as OttoCommand
}
