package com.digitaldodo.arth.core.network

import com.digitaldodo.arth.BuildConfig
import com.digitaldodo.arth.core.security.SecureStorage
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Response
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.http.*
import java.util.concurrent.TimeUnit

@Serializable
data class CategoryDto(
    val id: String,
    val name: String,
    val type: String = "expense",
    val icon: String? = null,
    val color: String? = null,
    @SerialName("sort_order") val sortOrder: Int = 0,
    @SerialName("is_default") val isDefault: Boolean = false,
    @SerialName("archived_at") val archivedAt: String? = null,
    @SerialName("is_archived") val isArchived: Boolean = false
)

@Serializable
data class CategoryListResponseDto(
    val categories: List<CategoryDto> = emptyList()
)

@Serializable
data class CreateTransactionApiRequest(
    val id: String,
    val amount: String,
    val type: String,
    @SerialName("category_id") val categoryId: String,
    @SerialName("transaction_date") val transactionDate: String,
    @SerialName("payment_method") val paymentMethod: String,
    val necessity: String? = null,
    val description: String? = null,
    val notes: String? = null,
    @SerialName("recorded_at") val recordedAt: String? = null,
    @SerialName("created_at") val createdAt: String? = null
)

@Serializable
data class TransactionApiResponse(
    val transaction: TransactionApiDto? = null,
    @SerialName("idempotent_replay") val idempotentReplay: Boolean = false
)

@Serializable
data class TransactionApiDto(
    val id: String,
    @SerialName("amount_paise") val amountPaise: Long = 0L,
    @SerialName("amount_decimal") val amountDecimal: String? = null,
    @SerialName("formatted_inr") val formattedInr: String? = null,
    val type: String = "expense",
    @SerialName("category_id") val categoryId: String = "",
    @SerialName("category_name") val categoryName: String? = null,
    @SerialName("transaction_date") val transactionDate: String = "",
    @SerialName("payment_method") val paymentMethod: String = "online",
    val necessity: String? = null,
    val description: String? = null,
    val notes: String? = null,
    @SerialName("recorded_at") val recordedAt: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null
)

@Serializable
data class TransactionListApiResponse(
    val items: List<TransactionApiDto> = emptyList(),
    val page: Int = 1,
    @SerialName("page_size") val pageSize: Int = 50,
    @SerialName("total_count") val totalCount: Int = 0,
    @SerialName("has_more") val hasMore: Boolean = false
)

@Serializable
data class BalancesDto(
    @SerialName("cash_paise") val cashPaise: Long = 0L,
    @SerialName("online_paise") val onlinePaise: Long = 0L,
    @SerialName("total_available_paise") val totalAvailablePaise: Long = 0L,
    @SerialName("starting_cash_paise") val startingCashPaise: Long = 0L,
    @SerialName("starting_online_paise") val startingOnlinePaise: Long = 0L,
    @SerialName("configured_at") val configuredAt: String? = null
)

@Serializable
data class DashboardSummaryDto(
    val metrics: DashboardMetricsDto? = null,
    @SerialName("spending_by_category") val spendingByCategory: List<CategorySpendingDto> = emptyList(),
    @SerialName("spending_by_necessity") val spendingByNecessity: List<NecessitySpendingDto> = emptyList(),
    @SerialName("recent_transactions") val recentTransactions: List<TransactionApiDto> = emptyList()
)

@Serializable
data class DashboardMetricsDto(
    @SerialName("total_income_paise") val totalIncomePaise: Long = 0L,
    @SerialName("total_expense_paise") val totalExpensePaise: Long = 0L,
    @SerialName("net_cash_flow_paise") val netCashFlowPaise: Long = 0L,
    @SerialName("savings_rate_percent") val savingsRatePercent: Double = 0.0,
    @SerialName("transaction_count") val transactionCount: Int = 0
)

@Serializable
data class CategorySpendingDto(
    @SerialName("category_id") val categoryId: String = "",
    @SerialName("category_name") val categoryName: String = "",
    @SerialName("amount_paise") val amountPaise: Long = 0L,
    @SerialName("percentage_of_total") val percentageOfTotal: Double = 0.0
)

@Serializable
data class NecessitySpendingDto(
    val necessity: String = "",
    val label: String = "",
    @SerialName("amount_paise") val amountPaise: Long = 0L,
    @SerialName("percentage_of_total") val percentageOfTotal: Double = 0.0
)

@Serializable
data class PersonDto(
    val id: String,
    val name: String,
    @SerialName("net_balance_paise") val netBalancePaise: Long = 0L,
    @SerialName("money_given_paise") val moneyGivenPaise: Long = 0L,
    @SerialName("money_received_paise") val moneyReceivedPaise: Long = 0L,
    @SerialName("settlement_count") val settlementCount: Int = 0
)

@Serializable
data class PeopleListResponseDto(
    val people: List<PersonDto> = emptyList()
)

@Serializable
data class CreatePersonApiRequest(
    val name: String
)

@Serializable
data class PersonApiResponse(
    val person: PersonDto? = null
)

@Serializable
data class SettlementApiRequest(
    val amount: String,
    @SerialName("payment_method") val paymentMethod: String = "online",
    val notes: String? = null
)

@Serializable
data class SettlementApiResponse(
    val success: Boolean = true,
    val message: String? = null
)

@Serializable
data class LoginRequest(
    val email: String,
    val password: String
)

@Serializable
data class AuthResponse(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String,
    val user: AuthUser
)

@Serializable
data class RefreshRequest(
    @SerialName("refresh_token") val refreshToken: String
)

@Serializable
data class AuthUser(
    val id: String,
    val email: String? = null
)

interface ArthApi {
    @GET("api/v1/categories")
    suspend fun getCategories(): CategoryListResponseDto

    @POST("api/v1/transactions")
    suspend fun createTransaction(@Body request: CreateTransactionApiRequest): TransactionApiResponse

    @GET("api/v1/transactions")
    suspend fun getTransactions(
        @Query("page") page: Int = 1,
        @Query("page_size") pageSize: Int = 50
    ): TransactionListApiResponse

    @GET("api/v1/balances")
    suspend fun getBalances(): BalancesDto

    @GET("api/v1/dashboard/summary")
    suspend fun getDashboardSummary(
        @Query("start_date") startDate: String? = null,
        @Query("end_date") endDate: String? = null
    ): DashboardSummaryDto

    @GET("api/v1/people")
    suspend fun getPeople(): PeopleListResponseDto

    @POST("api/v1/people")
    suspend fun createPerson(@Body request: CreatePersonApiRequest): PersonApiResponse

    @POST("api/v1/people/{id}/settlements")
    suspend fun recordSettlement(
        @Path("id") id: String,
        @Body request: SettlementApiRequest
    ): SettlementApiResponse
}

interface NativeAuthApi {
    @POST("api/native/auth/login")
    suspend fun login(@Body body: LoginRequest): AuthResponse

    @POST("api/native/auth/refresh")
    suspend fun refreshToken(@Body body: RefreshRequest): AuthResponse
}

interface SupabaseAuthApi {
    @POST("auth/v1/token?grant_type=password")
    suspend fun login(@Body body: LoginRequest): AuthResponse

    @POST("auth/v1/token?grant_type=refresh_token")
    suspend fun refreshToken(@Body body: RefreshRequest): AuthResponse
}

class AuthInterceptor(private val secureStorage: SecureStorage) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        val builder = original.newBuilder()

        // Inject anon key if configured
        if (BuildConfig.SUPABASE_ANON_KEY.isNotBlank()) {
            builder.addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
        }

        // Inject bearer token if available
        secureStorage.getAccessToken()?.let { token ->
            builder.addHeader("Authorization", "Bearer $token")
        }

        return chain.proceed(builder.build())
    }
}

object NetworkClient {
    private const val DEFAULT_API_BASE_URL = "https://arth-backend-nchl.onrender.com/"
    private const val DEFAULT_SUPABASE_BASE_URL = "https://fbmmkqdwkayrrsodueqd.supabase.co/"
    private const val DEFAULT_WEB_BASE_URL = "https://arth-9h3f.vercel.app/"

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
    }

    private fun sanitizeBaseUrl(configured: String?, defaultUrl: String): String {
        val candidate = configured?.trim().orEmpty()
        return if (candidate.startsWith("http://") || candidate.startsWith("https://")) {
            candidate.trimEnd('/') + "/"
        } else {
            defaultUrl
        }
    }

    fun createArthApi(secureStorage: SecureStorage): ArthApi {
        val baseUrl = sanitizeBaseUrl(BuildConfig.API_URL, DEFAULT_API_BASE_URL)
        val client = OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor(secureStorage))
            .addInterceptor(HttpLoggingInterceptor().apply {
                level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BODY else HttpLoggingInterceptor.Level.NONE
            })
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .build()

        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(ArthApi::class.java)
    }

    fun createNativeAuthApi(): NativeAuthApi {
        val baseUrl = sanitizeBaseUrl(BuildConfig.WEB_URL, DEFAULT_WEB_BASE_URL)
        val client = OkHttpClient.Builder()
            .addInterceptor(HttpLoggingInterceptor().apply {
                level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BODY else HttpLoggingInterceptor.Level.NONE
            })
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .build()

        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(NativeAuthApi::class.java)
    }

    fun createSupabaseAuthApi(): SupabaseAuthApi {
        val baseUrl = sanitizeBaseUrl(BuildConfig.SUPABASE_URL, DEFAULT_SUPABASE_BASE_URL)
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                val req = chain.request().newBuilder()
                if (BuildConfig.SUPABASE_ANON_KEY.isNotBlank()) {
                    req.addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
                }
                chain.proceed(req.build())
            }
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .build()

        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(SupabaseAuthApi::class.java)
    }
}
