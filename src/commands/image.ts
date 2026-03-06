import chalk from "chalk";

const lemon = chalk.hex("#F5E642");
const cyan = chalk.hex("#00D4FF");

export async function imageCommand(description?: string): Promise<void> {
  console.log("");
  console.log(lemon.bold("  Image Generation"));
  console.log("");

  if (description) {
    console.log(`  ${chalk.gray("Prompt:")} ${chalk.white(description)}`);
    console.log("");
  }

  console.log(
    `  ${cyan("Coming soon.")} Will support:`
  );
  console.log(`    ${chalk.gray("*")} ${chalk.white("Product photos")}`);
  console.log(`    ${chalk.gray("*")} ${chalk.white("Blog images")}`);
  console.log(`    ${chalk.gray("*")} ${chalk.white("Social media graphics")}`);
  console.log("");
}
