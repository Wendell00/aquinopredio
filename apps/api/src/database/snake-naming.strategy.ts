import { DefaultNamingStrategy, type NamingStrategyInterface } from "typeorm";

function snakeCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

/** Colunas e chaves em snake_case no banco, propriedades em camelCase no código. */
export class SnakeNamingStrategy extends DefaultNamingStrategy implements NamingStrategyInterface {
  override columnName(
    propertyName: string,
    customName: string | undefined,
    prefixes: string[],
  ): string {
    return customName ?? snakeCase([...prefixes, propertyName].join("_"));
  }

  override relationName(propertyName: string): string {
    return snakeCase(propertyName);
  }

  override joinColumnName(relationName: string, referencedColumnName: string): string {
    return snakeCase(`${relationName}_${referencedColumnName}`);
  }
}
