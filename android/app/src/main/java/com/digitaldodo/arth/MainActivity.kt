package com.digitaldodo.arth

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.*
import com.digitaldodo.arth.core.designsystem.ArthTheme
import com.digitaldodo.arth.core.security.SecureStorage
import com.digitaldodo.arth.feature.auth.AuthViewModel
import com.digitaldodo.arth.feature.auth.LoginScreen
import com.digitaldodo.arth.feature.balances.BalancesScreen
import com.digitaldodo.arth.feature.balances.BalancesViewModel
import com.digitaldodo.arth.feature.categories.CategoriesScreen
import com.digitaldodo.arth.feature.categories.CategoriesViewModel
import com.digitaldodo.arth.feature.dashboard.DashboardScreen
import com.digitaldodo.arth.feature.dashboard.DashboardViewModel
import com.digitaldodo.arth.feature.ledger.LedgerScreen
import com.digitaldodo.arth.feature.ledger.LedgerViewModel
import com.digitaldodo.arth.feature.people.PeopleScreen
import com.digitaldodo.arth.feature.people.PeopleViewModel
import com.digitaldodo.arth.feature.people.PersonDetailScreen
import com.digitaldodo.arth.feature.quickadd.QuickAddSheet
import com.digitaldodo.arth.feature.quickadd.QuickAddViewModel
import com.digitaldodo.arth.feature.reports.ReportsScreen
import com.digitaldodo.arth.feature.settings.SettingsScreen
import com.digitaldodo.arth.feature.sms.SmsReviewScreen
import com.digitaldodo.arth.feature.sms.SmsViewModel

sealed class Screen(val route: String, val title: String, val icon: ImageVector, val selectedIcon: ImageVector) {
    object Dashboard : Screen("dashboard", "Dashboard", Icons.Outlined.Home, Icons.Filled.Home)
    object Ledger : Screen("ledger", "Ledger", Icons.Outlined.ReceiptLong, Icons.Filled.ReceiptLong)
    object QuickAdd : Screen("quick_add", "Add", Icons.Outlined.AddCircleOutline, Icons.Filled.AddCircle)
    object Categories : Screen("categories", "Categories", Icons.Outlined.Category, Icons.Filled.Category)
    object More : Screen("more", "More", Icons.Outlined.MoreHoriz, Icons.Filled.MoreHoriz)
}

class MainActivity : FragmentActivity() {
    private val authViewModel: AuthViewModel by viewModels()
    private val dashboardViewModel: DashboardViewModel by viewModels()
    private val ledgerViewModel: LedgerViewModel by viewModels()
    private val quickAddViewModel: QuickAddViewModel by viewModels()
    private val categoriesViewModel: CategoriesViewModel by viewModels()
    private val peopleViewModel: PeopleViewModel by viewModels()
    private val balancesViewModel: BalancesViewModel by viewModels()
    private val smsViewModel: SmsViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val secureStorage = SecureStorage(this)
        val requireBiometric = secureStorage.isLoggedIn() && secureStorage.isBiometricLockEnabled()

        setContent {
            ArthTheme {
                var isUnlocked by remember { mutableStateOf(!requireBiometric) }

                LaunchedEffect(Unit) {
                    if (requireBiometric) {
                        promptBiometrics { isUnlocked = true }
                    }
                }

                if (!isUnlocked) {
                    Surface(
                        modifier = Modifier.fillMaxSize(),
                        color = MaterialTheme.colorScheme.background
                    ) {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = androidx.compose.ui.Alignment.Center
                        ) {
                            Text(
                                text = "Locked with Biometrics",
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.onBackground
                            )
                        }
                    }
                } else {
                    ArthAppNavHost(
                        authViewModel = authViewModel,
                        dashboardViewModel = dashboardViewModel,
                        ledgerViewModel = ledgerViewModel,
                        quickAddViewModel = quickAddViewModel,
                        categoriesViewModel = categoriesViewModel,
                        peopleViewModel = peopleViewModel,
                        balancesViewModel = balancesViewModel,
                        smsViewModel = smsViewModel,
                        isLoggedInInitial = secureStorage.isLoggedIn()
                    )
                }
            }
        }
    }

    private fun promptBiometrics(onSuccess: () -> Unit) {
        val executor = ContextCompat.getMainExecutor(this)
        val biometricPrompt = BiometricPrompt(
            this,
            executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    super.onAuthenticationSucceeded(result)
                    onSuccess()
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    super.onAuthenticationError(errorCode, errString)
                    // If device doesn't have biometrics enrolled or error, let them in or finish
                    if (errorCode == BiometricPrompt.ERROR_NO_BIOMETRICS || errorCode == BiometricPrompt.ERROR_HW_NOT_PRESENT) {
                        onSuccess()
                    }
                }
            }
        )

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Unlock Arth")
            .setSubtitle("Authenticate to view your financial ledger")
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL)
            .build()

        biometricPrompt.authenticate(promptInfo)
    }
}

@Composable
fun ArthAppNavHost(
    authViewModel: AuthViewModel,
    dashboardViewModel: DashboardViewModel,
    ledgerViewModel: LedgerViewModel,
    quickAddViewModel: QuickAddViewModel,
    categoriesViewModel: CategoriesViewModel,
    peopleViewModel: PeopleViewModel,
    balancesViewModel: BalancesViewModel,
    smsViewModel: SmsViewModel,
    isLoggedInInitial: Boolean
) {
    val navController = rememberNavController()
    var showQuickAddSheet by remember { mutableStateOf(false) }

    val startDestination = if (isLoggedInInitial) "main" else "login"

    NavHost(
        navController = navController,
        startDestination = startDestination
    ) {
        composable("login") {
            LoginScreen(
                viewModel = authViewModel,
                onLoginSuccess = {
                    navController.navigate("main") {
                        popUpTo("login") { inclusive = true }
                    }
                }
            )
        }

        composable("main") {
            MainTabsScaffold(
                dashboardViewModel = dashboardViewModel,
                ledgerViewModel = ledgerViewModel,
                categoriesViewModel = categoriesViewModel,
                onOpenQuickAdd = { showQuickAddSheet = true },
                onNavigateToBalances = { navController.navigate("balances") },
                onNavigateToPeople = { navController.navigate("people") },
                onNavigateToReports = { navController.navigate("reports") },
                onNavigateToSmsReview = { navController.navigate("sms_review") },
                onSignOut = {
                    navController.navigate("login") {
                        popUpTo("main") { inclusive = true }
                    }
                }
            )
        }

        composable("balances") {
            BalancesScreen(
                viewModel = balancesViewModel,
                onBack = { navController.popBackStack() }
            )
        }

        composable("people") {
            PeopleScreen(
                viewModel = peopleViewModel,
                onPersonClick = { person ->
                    navController.navigate("person_detail/${person.id}")
                }
            )
        }

        composable("person_detail/{personId}") { backStackEntry ->
            val personId = backStackEntry.arguments?.getString("personId")
            val person = peopleViewModel.uiState.collectAsState().value.people.find { it.id == personId }
            if (person != null) {
                PersonDetailScreen(
                    person = person,
                    viewModel = peopleViewModel,
                    onBack = { navController.popBackStack() }
                )
            }
        }

        composable("reports") {
            ReportsScreen(
                onBack = { navController.popBackStack() }
            )
        }

        composable("sms_review") {
            SmsReviewScreen(
                viewModel = smsViewModel,
                onBack = { navController.popBackStack() }
            )
        }
    }

    if (showQuickAddSheet) {
        QuickAddSheet(
            viewModel = quickAddViewModel,
            onDismiss = {
                showQuickAddSheet = false
                quickAddViewModel.reset()
                dashboardViewModel.refresh()
            }
        )
    }
}

@Composable
fun MainTabsScaffold(
    dashboardViewModel: DashboardViewModel,
    ledgerViewModel: LedgerViewModel,
    categoriesViewModel: CategoriesViewModel,
    onOpenQuickAdd: () -> Unit,
    onNavigateToBalances: () -> Unit,
    onNavigateToPeople: () -> Unit,
    onNavigateToReports: () -> Unit,
    onNavigateToSmsReview: () -> Unit,
    onSignOut: () -> Unit
) {
    val tabNavController = rememberNavController()
    val navBackStackEntry by tabNavController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    val items = listOf(
        Screen.Dashboard,
        Screen.Ledger,
        Screen.QuickAdd,
        Screen.Categories,
        Screen.More
    )

    Scaffold(
        bottomBar = {
            NavigationBar(
                containerColor = MaterialTheme.colorScheme.surface,
                tonalElevation = 0.dp
            ) {
                items.forEach { screen ->
                    val isSelected = currentRoute == screen.route
                    NavigationBarItem(
                        icon = {
                            Icon(
                                imageVector = if (isSelected) screen.selectedIcon else screen.icon,
                                contentDescription = screen.title
                            )
                        },
                        label = { Text(screen.title) },
                        selected = isSelected,
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = MaterialTheme.colorScheme.onSurface,
                            selectedTextColor = MaterialTheme.colorScheme.onSurface,
                            indicatorColor = MaterialTheme.colorScheme.surfaceVariant,
                            unselectedIconColor = ArthTheme.colors.textMuted,
                            unselectedTextColor = ArthTheme.colors.textMuted
                        ),
                        onClick = {
                            if (screen == Screen.QuickAdd) {
                                onOpenQuickAdd()
                            } else {
                                tabNavController.navigate(screen.route) {
                                    popUpTo(tabNavController.graph.findStartDestination().id) {
                                        saveState = true
                                    }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            }
                        }
                    )
                }
            }
        }
    ) { padding ->
        Box(modifier = Modifier.padding(padding)) {
            NavHost(
                navController = tabNavController,
                startDestination = Screen.Dashboard.route
            ) {
                composable(Screen.Dashboard.route) {
                    DashboardScreen(
                        viewModel = dashboardViewModel,
                        onNavigateToLedger = {
                            tabNavController.navigate(Screen.Ledger.route) {
                                launchSingleTop = true
                            }
                        },
                        onNavigateToSmsReview = onNavigateToSmsReview,
                        onTransactionClick = { txId ->
                            tabNavController.navigate(Screen.Ledger.route) {
                                launchSingleTop = true
                            }
                        }
                    )
                }

                composable(Screen.Ledger.route) {
                    LedgerScreen(
                        viewModel = ledgerViewModel,
                        onAddTransactionClick = onOpenQuickAdd
                    )
                }

                composable(Screen.Categories.route) {
                    CategoriesScreen(
                        viewModel = categoriesViewModel
                    )
                }

                composable(Screen.More.route) {
                    SettingsScreen(
                        onNavigateToBalances = onNavigateToBalances,
                        onNavigateToPeople = onNavigateToPeople,
                        onNavigateToReports = onNavigateToReports,
                        onNavigateToSmsReview = onNavigateToSmsReview,
                        onSignOut = onSignOut
                    )
                }
            }
        }
    }
}
