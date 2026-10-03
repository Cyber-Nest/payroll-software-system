export const taxConfigSeedData = {
  taxVersions: [
    {
      jurisdiction: 'FEDERAL',
      verified: true,
      verificationNote: 'CRA-confirmed 2026 federal reference values from tax-reference/2026.md.',
      basicPersonalAmount: '16452.00',
      basicPersonalAmountMax: '16452.00',
      basicPersonalAmountPhaseOutStart: '177882.00',
      basicPersonalAmountPhaseOutEnd: '253414.00',
      canadaEmploymentAmount: '1501.00',
      brackets: [
        { threshold: '0.00', rate: '0.1400', constant: '0.00' },
        { threshold: '57375.00', rate: '0.2050', constant: '3804.00' },
        { threshold: '114750.00', rate: '0.2600', constant: '10114.88' },
        { threshold: '177882.00', rate: '0.2900', constant: '14803.34' },
        { threshold: '253414.00', rate: '0.3300', constant: '24939.90' }
      ]
    },
    {
      jurisdiction: 'AB',
      verified: true,
      verificationNote: 'CRA-confirmed 2026 Alberta reference values from tax-reference/2026.md.',
      basicPersonalAmount: '22769.00',
      supplementalCreditThreshold: '61200.00',
      supplementalCreditRate: '0.0200',
      brackets: [
        { threshold: '0.00', rate: '0.0800', constant: '0.00' },
        { threshold: '61200.00', rate: '0.1000', constant: '1224.00' },
        { threshold: '181481.00', rate: '0.1200', constant: '6654.30' },
        { threshold: '241974.00', rate: '0.1300', constant: '9074.04' },
        { threshold: '362961.00', rate: '0.1400', constant: '12703.65' }
      ]
    },
    {
      jurisdiction: 'BC',
      verified: false,
      verificationNote:
        'Self-derived bracket constants; manually verify against CRA before production use.',
      basicPersonalAmount: '12932.00',
      brackets: [
        { threshold: '0.00', rate: '0.0506', constant: '0.00' },
        { threshold: '49279.00', rate: '0.0770', constant: '1301.97' },
        { threshold: '98560.00', rate: '0.1050', constant: '4061.71' },
        { threshold: '113158.00', rate: '0.1229', constant: '6087.33' },
        { threshold: '137407.00', rate: '0.1470', constant: '9399.84' },
        { threshold: '186306.00', rate: '0.1680', constant: '13312.27' },
        { threshold: '259829.00', rate: '0.2050', constant: '22926.00' }
      ]
    },
    {
      jurisdiction: 'MB',
      verified: false,
      verificationNote:
        'Self-derived bracket constants and BPA clawback values; manually verify against CRA before production use.',
      basicPersonalAmount: '15780.00',
      bpaClawbackStart: '200000.00',
      bpaClawbackEnd: '400000.00',
      brackets: [
        { threshold: '0.00', rate: '0.1080', constant: '0.00' },
        { threshold: '47564.00', rate: '0.1275', constant: '927.50' },
        { threshold: '101200.00', rate: '0.1740', constant: '5633.58' }
      ]
    },
    {
      jurisdiction: 'ON',
      verified: true,
      verificationNote: 'CRA 2026 T4032-ON rates, thresholds, constants and basic personal amount.',
      basicPersonalAmount: '12989.00',
      brackets: [
        { threshold: '0.00', rate: '0.0505', constant: '0.00' },
        { threshold: '53891.00', rate: '0.0915', constant: '2210.00' },
        { threshold: '107785.00', rate: '0.1116', constant: '4376.00' },
        { threshold: '150000.00', rate: '0.1216', constant: '5876.00' },
        { threshold: '220000.00', rate: '0.1316', constant: '8076.00' }
      ]
    },
    {
      jurisdiction: 'SK',
      verified: true,
      verificationNote:
        'CRA-confirmed 2026 Saskatchewan reference values from tax-reference/2026.md.',
      basicPersonalAmount: '20381.00',
      brackets: [
        { threshold: '0.00', rate: '0.1050', constant: '0.00' },
        { threshold: '53463.00', rate: '0.1250', constant: '1091.00' },
        { threshold: '152750.00', rate: '0.1450', constant: '4124.26' }
      ]
    }
  ],
  statutory: {
    verified: true,
    verificationNote: 'CRA-confirmed 2026 CPP/EI reference values from tax-reference/2026.md.',
    cpp: {
      ympe: '71300.00',
      basicExemption: '3500.00',
      rate: '0.0595',
      maxContribution: '4230.45'
    },
    cpp2: { yampe: '81700.00', rate: '0.0400', maxContribution: '416.00' },
    ei: {
      maxInsurableEarnings: '68900.00',
      employeeRate: '0.0163',
      employerRate: '0.02282',
      maxPremium: '1123.07'
    }
  }
} as const;
